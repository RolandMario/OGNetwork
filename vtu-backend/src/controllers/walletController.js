'use strict';

// src/controllers/walletController.js

const paymentService = require('../services/paymentService');
const monnifyService = require('../services/monnifyService');
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
        commissionBalanceKobo:  wallet.commissionBalance || 0,
        commissionBalanceNaira: (wallet.commissionBalance || 0) / 100,
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

// ---------------------------------------------------------------------------
// Monnify Initiate Funding
// ---------------------------------------------------------------------------

/**
 * @desc    Initiate wallet funding via Monnify
 * @route   POST /api/v1/user/wallet/fund/monnify
 * @access  Private
 */
exports.initiateMonnifyFunding = async (req, res) => {
  try {
    const { amount }  = req.body;
    const Transaction = req.models.Transaction;
    const User        = req.models.User;

    // 1. Validate amount
    if (!amount || isNaN(amount) || Number(amount) < 100) {
      return res.status(400).json({
        status:  'fail',
        message: 'Minimum funding amount is ₦100.',
      });
    }

    const amountNaira = Number(amount);
    const amountKobo  = Math.round(amountNaira * 100);

    // 2. Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }

    // 3. Generate unique reference
    const reference = monnifyService.generateReference();

    // 4. Create PENDING transaction BEFORE calling Monnify
    await Transaction.create({
      user:                 req.user.id,
      type:                 'FUNDING',
      amount:               amountKobo,
      status:               'PENDING',
      transactionReference: reference,
      details: {
        beneficiary:  user.email,
        paymentMethod: 'monnify',
      },
    });

    // 5. Initialise Monnify transaction
    const callbackUrl = `${process.env.FRONTEND_URL}/wallet/verify-monnify?reference=${reference}`;
    const { checkoutUrl, transactionReference } = await monnifyService.initializeTransaction({
      amount:        String(amountNaira),
      reference,
      customerName:  user.fullName,
      customerEmail: user.email,
      callbackUrl,
    });

    // Store Monnify's transaction reference on our record
    await Transaction.findOneAndUpdate(
      { transactionReference: reference },
      { paymentGatewayRef: transactionReference }
    );

    res.status(200).json({
      status:  'success',
      message: 'Monnify payment initialised.',
      data: {
        paymentUrl:           checkoutUrl,
        transactionReference: reference,
        monnifyReference:     transactionReference,
        amountNaira:          amountNaira,
      },
    });

  } catch (error) {
    console.error('initiateMonnifyFunding error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Monnify Verify Funding
// ---------------------------------------------------------------------------

/**
 * @desc    Verify payment after Monnify callback
 * @route   POST /api/v1/user/wallet/verify/monnify
 * @access  Private
 */
exports.verifyMonnifyFunding = async (req, res) => {
  try {
    const { reference } = req.body;
    const Transaction   = req.models.Transaction;
    const Wallet        = req.models.Wallet;

    if (!reference) {
      return res.status(400).json({ status: 'fail', message: 'Reference is required.' });
    }

    const transaction = await Transaction.findOne({ transactionReference: reference });
    if (!transaction) {
      return res.status(404).json({ status: 'fail', message: 'Transaction not found.' });
    }

    // Case 1 — webhook already processed it
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

    // Case 2 — verify with Monnify directly
    const monnifyRef = transaction.paymentGatewayRef;
    if (!monnifyRef) {
      return res.status(400).json({
        status:  'fail',
        message: 'No Monnify reference found for this transaction.',
      });
    }

    const monnifyData = await monnifyService.verifyTransaction(monnifyRef);

    if (monnifyData.paymentStatus === 'PAID' || monnifyData.paymentStatus === 'OVERPAID') {
      const { balance } = await creditWallet({
        transaction,
        amountKobo: Math.round(Number(monnifyData.paidAmount || monnifyData.amount) * 100),
        gatewayRef: monnifyData.transactionReference,
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

    // Case 3 — payment not completed yet
    res.status(200).json({
      status:  'success',
      message: `Payment status: ${monnifyData.paymentStatus}. Not yet confirmed.`,
      data: {
        newBalance:     null,
        reference,
        monnifyStatus:  monnifyData.paymentStatus,
      },
    });

  } catch (error) {
    console.error('verifyMonnifyFunding error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get Manual Transfer Accounts (company bank accounts for user to transfer to)
// ---------------------------------------------------------------------------

/**
 * @desc    Get list of active manual transfer bank accounts
 * @route   GET /api/v1/user/wallet/manual-transfer-accounts
 * @access  Private
 */
exports.getManualTransferAccounts = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;

    const config = await AdminConfig.findOne({ key: 'manual_transfer_accounts' });
    const accounts = config?.value || [];

    // Only return active accounts, and strip internal fields
    const activeAccounts = accounts
      .filter(acc => acc.isActive !== false)
      .map(acc => ({
        id:            acc._id || acc.id,
        bankName:      acc.bankName,
        accountNumber: acc.accountNumber,
        accountName:   acc.accountName,
      }));

    res.status(200).json({
      status: 'success',
      data: {
        accounts: activeAccounts,
      },
    });
  } catch (error) {
    console.error('getManualTransferAccounts error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Notify Manual Transfer — user reports they've made a transfer
// ---------------------------------------------------------------------------

/**
 * @desc    User notifies that they've made a manual bank transfer
 * @route   POST /api/v1/user/wallet/manual-transfer-notify
 * @access  Private
 * @body    { amount: number, accountId: string, userNote?: string }
 */
exports.notifyManualTransfer = async (req, res) => {
  try {
    const { amount, accountId, userNote } = req.body;
    const Transaction = req.models.Transaction;
    const Wallet      = req.models.Wallet;
    const AdminConfig = req.models.AdminConfig;

    // 1. Validate amount
    if (!amount || isNaN(amount) || Number(amount) < 100) {
      return res.status(400).json({
        status:  'fail',
        message: 'Minimum funding amount is ₦100.',
      });
    }

    const amountNaira = Number(amount);
    const amountKobo  = Math.round(amountNaira * 100);

    // 2. Validate accountId and fetch account details
    if (!accountId) {
      return res.status(400).json({
        status:  'fail',
        message: 'Account ID is required.',
      });
    }

    const config = await AdminConfig.findOne({ key: 'manual_transfer_accounts' });
    const accounts = config?.value || [];
    const account = accounts.find(acc => String(acc._id || acc.id) === String(accountId));

    if (!account || account.isActive === false) {
      return res.status(400).json({
        status:  'fail',
        message: 'Invalid or inactive transfer account selected.',
      });
    }

    // 3. Idempotency check — prevent duplicate notifications
    //    Same user, same amount, same account, within last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingPending = await Transaction.findOne({
      user: req.user.id,
      type: 'MANUAL_FUNDING',
      status: 'PENDING',
      'details.accountNumber': account.accountNumber,
      amount: amountKobo,
      createdAt: { $gte: twentyFourHoursAgo },
    });

    if (existingPending) {
      return res.status(400).json({
        status:  'fail',
        message: 'A pending manual transfer notification for this amount and account already exists. Please wait for admin verification.',
      });
    }

    // 4. Get current wallet balance for reference
    const wallet = await Wallet.findOne({ user: req.user.id });
    const previousBalance = wallet ? wallet.balance : 0;

    // 5. Create PENDING MANUAL_FUNDING transaction
    const reference = 'OGN-MANUAL-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    await Transaction.create({
      user:                 req.user.id,
      type:                 'MANUAL_FUNDING',
      amount:               amountKobo,
      status:               'PENDING',
      transactionReference: reference,
      paymentGatewayRef:    'MANUAL_TRANSFER',
      previousBalance,
      newBalance:           previousBalance, // unchanged until admin approves
      details: {
        paymentMethod: 'manual_transfer',
        bankName:      account.bankName,
        accountNumber: account.accountNumber,
        accountName:   account.accountName,
        userNote:      userNote || '',
      },
    });

    res.status(200).json({
      status:  'success',
      message: 'Your transfer notification has been received. An admin will verify and credit your wallet shortly.',
      data: {
        transactionReference: reference,
        amountNaira,
        bankName:    account.bankName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
      },
    });

  } catch (error) {
    console.error('notifyManualTransfer error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Export creditWallet so webhookController can reuse it
module.exports.creditWallet = creditWallet;
