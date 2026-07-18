'use strict';

// src/controllers/walletController.js

const paymentService = require('../services/paymentService');
const { getTenantSecret } = require('../services/tenantConfigService');

// ---------------------------------------------------------------------------
// Helper — credit wallet and mark transaction SUCCESS (used by both
// verifyFunding and the webhook handler to avoid duplication)
// ---------------------------------------------------------------------------
async function creditWallet({ transaction, amountKobo, gatewayRef, Transaction, Wallet }) {
  // Idempotency — never double-credit
  if (transaction.status === 'SUCCESS') {
    const wallet = await Wallet.findOne({ user: transaction.user });
    return { alreadyProcessed: true, balance: wallet?.balance ?? transaction.newBalance };
  }

  const walletBefore = await Wallet.findOne({ user: transaction.user });
  if (!walletBefore) throw new Error('Wallet not found for user.');

  const previousBalance = walletBefore.balance;

  // Credit wallet atomically
  const updatedWallet = await Wallet.findOneAndUpdate(
    { user: transaction.user },
    { $inc: { balance: amountKobo } },
    { new: true }
  );

  // Update transaction status
  await Transaction.findOneAndUpdate(
    { _id: transaction._id },
    {
      status:            'SUCCESS',
      paymentGatewayRef: gatewayRef ? String(gatewayRef) : undefined,
      previousBalance,
      newBalance:        updatedWallet.balance,
    }
  );

  console.log(
    `[Wallet] Credited ₦${amountKobo / 100} for user ${transaction.user} | ` +
    `new balance: ₦${updatedWallet.balance / 100}`
  );

  return { alreadyProcessed: false, balance: updatedWallet.balance };
}

// ---------------------------------------------------------------------------
// Initiate funding
// ---------------------------------------------------------------------------

/**
 * @desc    Initiate wallet funding via Paystack
 * @route   POST /api/v1/user/wallet/fund
 * @access  Private
 */
exports.initiateFunding = async (req, res) => {
  try {
    const { amount }  = req.body;
    const Transaction = req.models.Transaction;
    const User        = req.models.User;
    const tenantId    = req.headers['x-tenant-id'];

    // 1. Validate amount
    if (!amount || isNaN(amount) || Number(amount) < 100) {
      return res.status(400).json({
        status:  'fail',
        message: 'Minimum funding amount is ₦100.',
      });
    }

    const amountKobo = Math.round(Number(amount) * 100);

    // 2. Get user email
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }

    // 3. Get tenant Paystack secret key
    const tenantConfig = getTenantSecret(tenantId);
    if (!tenantConfig?.paystackSecretKey) {
      return res.status(500).json({
        status:  'error',
        message: 'Payment gateway not configured for this tenant.',
      });
    }

    // 4. Generate unique reference
    const reference = paymentService.generateReference();

    // 5. Create PENDING transaction BEFORE calling Paystack
    //    Ensures webhook can always reconcile even if user abandons checkout.
    await Transaction.create({
      user:                 req.user.id,
      type:                 'FUNDING',
      amount:               amountKobo,
      status:               'PENDING',
      transactionReference: reference,
      details:              { beneficiary: user.email },
    });

    // 6. Initialise Paystack transaction
    const { authorizationUrl } = await paymentService.initializeTransaction({
      email:       user.email,
      amountKobo,
      reference,
      callbackUrl: `${process.env.FRONTEND_URL}/wallet/verify?reference=${reference}`,
      secretKey:   tenantConfig.paystackSecretKey,
    });

    res.status(200).json({
      status:  'success',
      message: 'Payment initialised.',
      data: {
        paymentUrl:           authorizationUrl,
        transactionReference: reference,
        amountNaira:          Number(amount),
      },
    });

  } catch (error) {
    console.error('initiateFunding error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Verify funding
// ---------------------------------------------------------------------------

/**
 * @desc    Verify payment after Paystack callback.
 *          If webhook already fired → return current balance.
 *          If webhook hasn't fired yet → verify with Paystack directly and
 *          credit the wallet here so the user isn't left waiting.
 * @route   POST /api/v1/user/wallet/verify
 * @access  Private
 */
exports.verifyFunding = async (req, res) => {
  try {
    const { reference } = req.body;
    const Transaction   = req.models.Transaction;
    const Wallet        = req.models.Wallet;
    const tenantId      = req.headers['x-tenant-id'];

    if (!reference) {
      return res.status(400).json({ status: 'fail', message: 'Reference is required.' });
    }

    const transaction = await Transaction.findOne({ transactionReference: reference });
    if (!transaction) {
      return res.status(404).json({ status: 'fail', message: 'Transaction not found.' });
    }

    // Case 1 — webhook already processed it, just return the balance
    if (transaction.status === 'SUCCESS') {
      const wallet = await Wallet.findOne({ user: transaction.user });
      return res.status(200).json({
        status:  'success',
        message: 'Payment already confirmed.',
        data: {
          newBalance: wallet?.balance ?? transaction.newBalance,
          reference,
        },
      });
    }

    // Case 2 — webhook hasn't fired yet, verify with Paystack directly
    const tenantConfig = getTenantSecret(tenantId);
    if (!tenantConfig?.paystackSecretKey) {
      return res.status(500).json({
        status:  'error',
        message: 'Payment gateway not configured for this tenant.',
      });
    }

    const paystackData = await paymentService.verifyTransaction(
      reference,
      tenantConfig.paystackSecretKey
    );

    if (paystackData.status === 'success') {
      // Paystack confirms payment — credit wallet now.
      // The webhook will also fire but the idempotency check in creditWallet
      // prevents double-crediting.
      const { balance } = await creditWallet({
        transaction,
        amountKobo:  paystackData.amount,
        gatewayRef:  paystackData.id,
        Transaction,
        Wallet,
      });

      return res.status(200).json({
        status:  'success',
        message: 'Payment confirmed. Wallet credited.',
        data: {
          newBalance: balance,
          reference,
        },
      });
    }

    // Case 3 — payment not completed on Paystack's end yet
    res.status(200).json({
      status:  'success',
      message: 'Payment not yet confirmed by Paystack.',
      data: {
        newBalance:     null,
        reference,
        paystackStatus: paystackData.status,
      },
    });

  } catch (error) {
    console.error('verifyFunding error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get wallet
// ---------------------------------------------------------------------------

/**
 * @desc    Get wallet balance and recent transactions
 * @route   GET /api/v1/user/wallet/balance
 * @access  Private
 */
exports.getWallet = async (req, res) => {
  try {
    const Wallet      = req.models.Wallet;
    const Transaction = req.models.Transaction;

    const [wallet, transactions] = await Promise.all([
      Wallet.findOne({ user: req.user.id }),
      Transaction.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    if (!wallet) {
      return res.status(404).json({ status: 'fail', message: 'Wallet not found.' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        balanceKobo:  wallet.balance,
        balanceNaira: wallet.balance / 100,
        currency:     wallet.currency,
        transactions,
      },
    });

  } catch (error) {
    console.error('getWallet error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};



// ---------------------------------------------------------------------------
// ADD THIS TO walletController.js — Get Dedicated Account Details
// ---------------------------------------------------------------------------

/**
 * @desc    Get the user's dedicated virtual account details for bank transfer funding
 * @route   GET /api/v1/user/wallet/account-details
 * @access  Private
 */
exports.getAccountDetails = async (req, res) => {
  try {
    const User = req.models.User;
    const user = await User.findById(req.user.id).select('dedicatedAccount fullName');

    if (!user.dedicatedAccount?.active) {
      return res.status(200).json({
        status: 'success',
        data: {
          provisioned: false,
          message: 'Dedicated account not yet provisioned. You can still fund via card/bank checkout, or tap "Activate Bank Transfer" to try again.',
        },
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        provisioned: true,
        accountNumber: user.dedicatedAccount.accountNumber,
        accountName:   user.dedicatedAccount.accountName,
        bankName:      user.dedicatedAccount.bankName,
      },
    });

  } catch (error) {
    console.error('getAccountDetails error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Export creditWallet so webhookController can reuse it
module.exports.creditWallet = creditWallet;