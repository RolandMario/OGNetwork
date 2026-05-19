const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');

/**
 * @desc    Get all users (with pagination)
 * @route   GET /api/v1/admin/users
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    // Basic pagination setup
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20; // Default 20 users per page
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-__v') // Don't send mongoose version key
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // Newest users first

    const total = await User.countDocuments();

    res.status(200).json({
      status: 'success',
      count: users.length,
      totalDocuments: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: users,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Get specific user details including wallet
 * @route   GET /api/v1/admin/users/:id
 * @access  Private/Admin
 */
exports.getUserDetails = async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Fetch wallet separately to ensure security and decoupling
      const wallet = await Wallet.findOne({ user: user._id });

      const userData = user.toObject();
      // Add wallet info, converting balance to major unit for admin display
      userData.wallet = wallet ? { ...wallet.toObject(), balanceMajor: wallet.balance / 100 } : null;

      res.status(200).json({
        status: 'success',
        data: userData,
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  };

/**
 * @desc    Get all transactions logs across the system
 * @route   GET /api/v1/admin/transactions
 * @access  Private/Admin
 */
exports.getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50; // Default 50 logs
    const skip = (page - 1) * limit;

    // Optional filtering by type or status if provided in query params
    let query = {};
    if(req.query.type) query.type = req.query.type.toUpperCase();
    if(req.query.status) query.status = req.query.status.toUpperCase();

    const transactions = await Transaction.find(query)
      .populate('user', 'fullName email phone') // Populate basics of user who performed it
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // Most recent first

    const total = await Transaction.countDocuments(query);

    // Convert amounts to major units for admin display
    const formattedTransactions = transactions.map(tx => {
        const txObj = tx.toObject();
        txObj.amountMajor = txObj.amount / 100;
        if(txObj.previousBalance) txObj.previousBalanceMajor = txObj.previousBalance / 100;
        if(txObj.newBalance) txObj.newBalanceMajor = txObj.newBalance / 100;
        return txObj;
    });

    res.status(200).json({
      status: 'success',
      count: formattedTransactions.length,
      totalDocuments: total,
      currentPage: page,
      data: formattedTransactions,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};



// src/controllers/adminController.js

// ... keep existing imports (User, Transaction, Wallet) ...

// ... keep existing controllers (getAllUsers, getUserDetails, getAllTransactions) ...


/**
 * @desc    Ban or Unban a user (Toggle isActive status)
 * @route   PATCH /api/v1/admin/users/:id/ban
 * @access  Private/Admin
 */
exports.banUser = async (req, res) => {
  try {
    const userIdToUpdate = req.params.id;
    // Expecting a boolean in body: { "isActive": false } to ban, { "isActive": true } to unban.
    // If not provided, default to false (ban action).
    const reqIsActive = req.body.isActive;
    const targetIsActiveState = reqIsActive === undefined ? false : reqIsActive;

    // --- SECURITY CHECKS ---

    // 1. Prevent an admin from banning themselves.
    // req.user.id comes from the 'protect' middleware executing before this controller.
    if (req.user._id.toString() === userIdToUpdate) {
      return res.status(400).json({
          status: 'fail',
          message: 'You cannot ban your own admin account.'
      });
    }

    // 2. Find the target user first to check their role.
    const userToUpdate = await User.findById(userIdToUpdate);

    if (!userToUpdate) {
      return res.status(404).json({
          status: 'fail',
          message: 'User not found.'
      });
    }

    // 3. Protect 'superadmin' from being banned by a regular 'admin'.
    // (Assuming your schema supports a 'superadmin' role and the current requester is just an 'admin')
    if (userToUpdate.role === 'superadmin' && req.user.role !== 'superadmin') {
       return res.status(403).json({
           status: 'fail',
           message: 'You do not have sufficient permissions to ban a Super Administrator.'
       });
    }

    // --- ACTION ---

    // Update state
    userToUpdate.isActive = targetIsActiveState;

    // We use save() instead of findByIdAndUpdate to ensure any future pre-save hooks run,
    // though we skip validation (like password checks) since we are only changing a flag.
    await userToUpdate.save({ validateBeforeSave: false });

    const actionText = targetIsActiveState ? 'activated' : 'banned/deactivated';

    res.status(200).json({
      status: 'success',
      message: `User account successfully ${actionText}.`,
      data: {
        id: userToUpdate._id,
        email: userToUpdate.email,
        isActive: userToUpdate.isActive,
      },
    });

  } catch (error) {
    console.error('Ban User Error:', error);
    res.status(500).json({
        status: 'error',
        message: 'An error occurred while updating user status.'
    });
  }
};