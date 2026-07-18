'use strict';

// src/controllers/userController.js

const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// Set Transaction PIN (first time)
// ---------------------------------------------------------------------------

/**
 * @desc    Set transaction PIN for the first time
 * @route   POST /api/v1/user/set-transaction-pin
 * @access  Private
 * @body    { pin: string } — 4-digit PIN
 */
exports.setTransactionPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const User    = req.models.User;

    if (!pin || String(pin).length !== 4 || isNaN(Number(pin))) {
      return res.status(400).json({
        status:  'fail',
        message: 'PIN must be exactly 4 digits.',
      });
    }

    const user = await User.findById(req.user.id).select('+isPinSet');

    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }

    if (user.isPinSet) {
      return res.status(400).json({
        status:  'fail',
        message: 'PIN already set. Use update-transaction-pin to change it.',
      });
    }

    // Hash PIN before storing
    const hashedPin = await bcrypt.hash(String(pin), 12);

    await User.findByIdAndUpdate(req.user.id, {
      transactionPin: hashedPin,
      isPinSet:       true,
    });

    res.status(200).json({
      status:  'success',
      message: 'Transaction PIN set successfully.',
    });

  } catch (error) {
    console.error('setTransactionPin error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Update Transaction PIN
// ---------------------------------------------------------------------------

/**
 * @desc    Update existing transaction PIN
 * @route   PATCH /api/v1/user/update-transaction-pin
 * @access  Private
 * @body    { currentPin: string, newPin: string }
 */
exports.updateTransactionPin = async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    const User = req.models.User;

    if (!currentPin || !newPin) {
      return res.status(400).json({
        status:  'fail',
        message: 'Both currentPin and newPin are required.',
      });
    }

    if (String(newPin).length !== 4 || isNaN(Number(newPin))) {
      return res.status(400).json({
        status:  'fail',
        message: 'New PIN must be exactly 4 digits.',
      });
    }

    const user = await User.findById(req.user.id).select('+transactionPin +isPinSet');

    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }

    if (!user.isPinSet || !user.transactionPin) {
      return res.status(400).json({
        status:  'fail',
        message: 'No PIN set. Use set-transaction-pin first.',
      });
    }

    // Verify current PIN
    const isValid = await bcrypt.compare(String(currentPin), user.transactionPin);
    if (!isValid) {
      return res.status(401).json({
        status:  'fail',
        message: 'Current PIN is incorrect.',
      });
    }

    if (String(currentPin) === String(newPin)) {
      return res.status(400).json({
        status:  'fail',
        message: 'New PIN must be different from current PIN.',
      });
    }

    const hashedPin = await bcrypt.hash(String(newPin), 12);

    await User.findByIdAndUpdate(req.user.id, {
      transactionPin: hashedPin,
    });

    res.status(200).json({
      status:  'success',
      message: 'Transaction PIN updated successfully.',
    });

  } catch (error) {
    console.error('updateTransactionPin error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Update Profile
// ---------------------------------------------------------------------------

/**
 * @desc    Update user profile (name, phone)
 *          Does NOT handle password — use /update-password for that.
 * @route   PATCH /api/v1/user/profile/update
 * @access  Private
 * @body    { fullName?, phone? }
 */
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const User = req.models.User;

    // Guard against password update via this route
    if (req.body.password) {
      return res.status(400).json({
        status:  'fail',
        message: 'Use /update-password to change your password.',
      });
    }

    const allowedUpdates = {};
    if (fullName) allowedUpdates.fullName = fullName;
    if (phone)    allowedUpdates.phone    = phone;

    if (!Object.keys(allowedUpdates).length) {
      return res.status(400).json({
        status:  'fail',
        message: 'Provide at least one field to update (fullName, phone).',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      allowedUpdates,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: 'success',
      data:   { user: updatedUser },
    });

  } catch (error) {
    console.error('updateProfile error:', error.message);

    // Handle duplicate phone number
    if (error.code === 11000) {
      return res.status(400).json({
        status:  'fail',
        message: 'Phone number already in use by another account.',
      });
    }

    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get Dashboard Data
// ---------------------------------------------------------------------------

/**
 * @desc    Get all data needed for the home dashboard in one request:
 *          user profile + wallet balance + last 5 transactions
 * @route   GET /api/v1/user/dashboard/data
 * @access  Private
 */
exports.getDashboardData = async (req, res) => {
  try {
    const User        = req.models.User;
    const Wallet      = req.models.Wallet;
    const Transaction = req.models.Transaction;

    const [user, wallet, transactions] = await Promise.all([
      User.findById(req.user.id),
      Wallet.findOne({ user: req.user.id }),
      Transaction.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    if (!wallet) {
      return res.status(404).json({ status: 'fail', message: 'Wallet not found.' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user,
        wallet: {
          balanceKobo:  wallet.balance,
          balanceNaira: wallet.balance / 100,
          currency:     wallet.currency,
        },
        recentTransactions: transactions,
      },
    });

  } catch (error) {
    console.error('getDashboardData error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

