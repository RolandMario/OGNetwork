'use strict';

// src/controllers/commissionController.js
//
// User-facing commission wallet endpoints:
//  - GET  /wallet/commission             → balance + commission history
//  - POST /wallet/commission/withdraw    → move commission balance into main wallet
//
// These are mounted under /api/v1/user/wallet (see walletRoutes.js), which is
// already behind authMiddleware.protect. The withdraw route is additionally
// protected by verifyPin so the user must confirm with their transaction PIN.

// ---------------------------------------------------------------------------
// Get commission wallet (balance + history)
// ---------------------------------------------------------------------------

/**
 * @desc    Get the user's commission balance and recent commission activity
 * @route   GET /api/v1/user/wallet/commission
 * @access  Private
 */
exports.getCommission = async (req, res) => {
  try {
    const Wallet      = req.models.Wallet;
    const Transaction = req.models.Transaction;

    const [wallet, history] = await Promise.all([
      Wallet.findOne({ user: req.user.id }),
      Transaction.find({ user: req.user.id, type: { $in: ['COMMISSION', 'COMMISSION_WITHDRAWAL'] } })
        .sort({ createdAt: -1 })
        .limit(50),
    ]);

    const commissionBalanceKobo = wallet ? wallet.commissionBalance || 0 : 0;

    res.status(200).json({
      status: 'success',
      data: {
        commissionBalanceKobo,
        commissionBalanceNaira: commissionBalanceKobo / 100,
        history,
      },
    });
  } catch (error) {
    console.error('[commissionController.getCommission] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Withdraw commission to main wallet
// ---------------------------------------------------------------------------

/**
 * @desc    Move commission balance into the user's main wallet.
 *          Accepts an optional `amount` (Naira); defaults to the full balance.
 * @route   POST /api/v1/user/wallet/commission/withdraw
 * @access  Private (PIN verified by middleware)
 * @body    { pin: string, amount?: number }
 */
exports.withdrawCommission = async (req, res) => {
  try {
    const Wallet      = req.models.Wallet;
    const Transaction = req.models.Transaction;
    const userId      = req.user.id;

    // 1. Fetch current wallet
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ status: 'fail', message: 'Wallet not found.' });
    }

    const availableKobo = wallet.commissionBalance || 0;
    if (availableKobo <= 0) {
      return res.status(400).json({
        status:  'fail',
        message: 'You have no commission available to withdraw yet.',
      });
    }

    // 2. Determine amount to withdraw (default: entire commission balance)
    let amountKobo = availableKobo;
    if (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '') {
      const requestedKobo = Math.round(Number(req.body.amount) * 100);
      if (isNaN(requestedKobo) || requestedKobo <= 0) {
        return res.status(400).json({
          status:  'fail',
          message: 'Withdrawal amount must be a positive number.',
        });
      }
      if (requestedKobo > availableKobo) {
        return res.status(400).json({
          status:  'fail',
          message: `Withdrawal amount exceeds your available commission (₦${(availableKobo / 100).toLocaleString('en-NG')}).`,
        });
      }
      amountKobo = requestedKobo;
    }

    const previousBalance        = wallet.balance;
    const previousCommission     = availableKobo;
    const reference = `OGN-COMMWITHDRAW-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 3. Atomically move funds: commissionBalance → balance.
    //    The filter guard ensures we never over-withdraw even under concurrency.
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId, commissionBalance: { $gte: amountKobo } },
      { $inc: { balance: amountKobo, commissionBalance: -amountKobo } },
      { new: true }
    );

    if (!updatedWallet) {
      return res.status(400).json({
        status:  'fail',
        message: 'Insufficient commission balance to withdraw.',
      });
    }

    // 4. Record the withdrawal transaction
    await Transaction.create({
      user:                 userId,
      type:                 'COMMISSION_WITHDRAWAL',
      amount:               amountKobo,
      status:               'SUCCESS',
      transactionReference: reference,
      previousBalance,
      newBalance:           updatedWallet.balance,
      details: {
        previousCommission,
        newCommission: updatedWallet.commissionBalance || 0,
      },
      note: `Commission withdrawn to main wallet`,
    });

    console.log(`[commission] User ${userId} withdrew ₦${amountKobo / 100} commission → main wallet (${updatedWallet.balance / 100})`);

    res.status(200).json({
      status:  'success',
      message: `₦${(amountKobo / 100).toLocaleString('en-NG')} commission withdrawn to your main wallet.`,
      data: {
        amountNaira:              amountKobo / 100,
        newBalance:               updatedWallet.balance / 100,
        commissionBalanceNaira:   (updatedWallet.commissionBalance || 0) / 100,
        transactionReference:     reference,
      },
    });
  } catch (error) {
    console.error('[commissionController.withdrawCommission] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};
