'use strict';

// src/controllers/adminController.js

const adminService = require('../services/adminService');
const providerRegistry = require('../services/providerRegistry');

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * @desc    Get dashboard overview stats
 * @route   GET /api/v1/admin/dashboard
 * @access  Private, Admin only
 * @query   ?month=8&year=2026 (optional — filters profits by month)
 */
exports.getDashboard = async (req, res) => {
  try {
    const User = req.models.User;
    const Transaction = req.models.Transaction;
    const Wallet = req.models.Wallet;

    const [totalUsers, activeUsers, totalTransactions, walletData] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Transaction.countDocuments(),
      Wallet.aggregate([
        { $group: { _id: null, totalBalance: { $sum: '$balance' } } },
      ]),
    ]);

    const [successfulTx, pendingTx, failedTx, recentTransactions] = await Promise.all([
      Transaction.countDocuments({ status: 'SUCCESS' }),
      Transaction.countDocuments({ status: 'PENDING' }),
      Transaction.countDocuments({ status: 'FAILED' }),
      Transaction.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'fullName email')
        .lean(),
    ]);

    // Calculate total revenue from successful transactions
    const revenueResult = await Transaction.aggregate([
      { $match: { status: 'SUCCESS', type: { $ne: 'FUNDING' } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // Build profit match filter — optionally filter by month/year
    const profitMatch = { status: 'SUCCESS', type: { $in: ['AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'] } };
    const { month, year } = req.query;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      if (m >= 1 && m <= 12 && y >= 2000) {
        const startDate = new Date(y, m - 1, 1);
        const endDate = new Date(y, m, 0, 23, 59, 59, 999);
        profitMatch.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    // Calculate profits grouped by service type
    const profitResult = await Transaction.aggregate([
      { $match: profitMatch },
      { $group: { _id: '$type', totalProfit: { $sum: '$profit' } } },
    ]);

    const profitsByService = {
      AIRTIME: 0,
      DATA: 0,
      CABLE: 0,
      ELECTRICITY: 0,
      total: 0,
    };

    for (const entry of profitResult) {
      const profitInNaira = entry.totalProfit / 100;
      profitsByService[entry._id] = profitInNaira;
      profitsByService.total += profitInNaira;
    }

    res.status(200).json({
      status: 'success',
      data: {
        totalUsers,
        activeUsers,
        totalTransactions,
        successfulTransactions: successfulTx,
        pendingTransactions: pendingTx,
        failedTransactions: failedTx,
        totalRevenue,
        totalVolume: walletData[0]?.totalBalance || 0,
        recentTransactions,
        profitsByService,
        // Include selected month/year in response for frontend reference
        selectedMonth: month ? parseInt(month) : null,
        selectedYear: year ? parseInt(year) : null,
      },
    });
  } catch (error) {
    console.error('[adminController.getDashboard] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * @desc    Get all users
 * @route   GET /api/v1/admin/users
 * @access  Private, Admin only
 */
exports.getUsers = async (req, res) => {
  try {
    const User = req.models.User;
    const { page = 1, limit = 50, search } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: { users, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[adminController.getUsers] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Toggle user active status
 * @route   PATCH /api/v1/admin/users/:id/status
 * @access  Private, Admin only
 */
exports.toggleUserStatus = async (req, res) => {
  try {
    const User = req.models.User;
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    console.error('[adminController.toggleUserStatus] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Update user level (upgrade/downgrade)
 * @route   PATCH /api/v1/admin/users/:id/level
 * @access  Private, Admin only
 * @body    { level: "affiliate" | "top_user" | "api_user" | "normal" }
 */
exports.updateUserLevel = async (req, res) => {
  try {
    const User = req.models.User;
    const { id } = req.params;
    const { level } = req.body;

    if (!level) {
      return res.status(400).json({ status: 'fail', message: 'level is required.' });
    }

    const user = await adminService.updateUserLevel(User, id, level);

    res.status(200).json({
      status: 'success',
      data: { user },
      message: `User level updated to ${level}.`,
    });
  } catch (error) {
    console.error('[adminController.updateUserLevel] error:', error.message);
    res.status(error.message.includes('Invalid') ? 400 : 500).json({
      status: 'fail',
      message: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * @desc    Get all transactions
 * @route   GET /api/v1/admin/transactions
 * @access  Private, Admin only
 */
exports.getTransactions = async (req, res) => {
  try {
    const Transaction = req.models.Transaction;
    const { page = 1, limit = 50, status, type } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'fullName email')
      .lean();

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: { transactions, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[adminController.getTransactions] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

/**
 * @desc    Get all wallets
 * @route   GET /api/v1/admin/wallets
 * @access  Private, Admin only
 */
exports.getWallets = async (req, res) => {
  try {
    const Wallet = req.models.Wallet;
    const { page = 1, limit = 50 } = req.query;

    const wallets = await Wallet.find()
      .sort({ balance: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'fullName email')
      .lean();

    const total = await Wallet.countDocuments();

    res.status(200).json({
      status: 'success',
      data: { wallets, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[adminController.getWallets] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Admin manually fund a user's wallet
 * @route   POST /api/v1/admin/wallets/fund
 * @access  Private, Admin only
 * @body    { userId: string, amount: number (in Naira), note?: string }
 */
exports.fundWallet = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const Wallet = req.models.Wallet;
    const Transaction = req.models.Transaction;

    // Validate amount
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Amount must be a positive number.',
      });
    }

    const amountKobo = Math.round(Number(amount) * 100);

    // Find wallet
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ status: 'fail', message: 'Wallet not found for this user.' });
    }

    const previousBalance = wallet.balance;

    // Credit wallet atomically
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: amountKobo } },
      { new: true }
    );

    // Create transaction record
    const reference = 'ADM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await Transaction.create({
      user: userId,
      type: 'ADMIN_CREDIT',
      amount: amountKobo,
      status: 'SUCCESS',
      transactionReference: reference,
      note: note || 'Manual wallet funding by admin',
      previousBalance,
      newBalance: updatedWallet.balance,
    });

    res.status(200).json({
      status: 'success',
      message: `Wallet funded with ₦${Number(amount).toLocaleString()}.`,
      data: {
        userId,
        amountFunded: Number(amount),
        previousBalance: previousBalance / 100,
        newBalance: updatedWallet.balance / 100,
      },
    });
  } catch (error) {
    console.error('[adminController.fundWallet] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Admin manually debit a user's wallet
 * @route   POST /api/v1/admin/wallets/debit
 * @access  Private, Admin only
 * @body    { userId: string, amount: number (in Naira), note?: string }
 */
exports.debitWallet = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const Wallet = req.models.Wallet;
    const Transaction = req.models.Transaction;

    // Validate amount
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Amount must be a positive number.',
      });
    }

    const amountKobo = Math.round(Number(amount) * 100);

    // Find wallet
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ status: 'fail', message: 'Wallet not found for this user.' });
    }

    // Check sufficient balance
    if (wallet.balance < amountKobo) {
      return res.status(400).json({
        status: 'fail',
        message: `Insufficient balance. User has ₦${(wallet.balance / 100).toLocaleString()} but debit amount is ₦${Number(amount).toLocaleString()}.`,
      });
    }

    const previousBalance = wallet.balance;

    // Debit wallet atomically
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: -amountKobo } },
      { new: true }
    );

    // Create transaction record
    const reference = 'ADM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await Transaction.create({
      user: userId,
      type: 'ADMIN_DEBIT',
      amount: amountKobo,
      status: 'SUCCESS',
      transactionReference: reference,
      note: note || 'Manual wallet debit by admin',
      previousBalance,
      newBalance: updatedWallet.balance,
    });

    res.status(200).json({
      status: 'success',
      message: `Wallet debited ₦${Number(amount).toLocaleString()}.`,
      data: {
        userId,
        amountDebited: Number(amount),
        previousBalance: previousBalance / 100,
        newBalance: updatedWallet.balance / 100,
      },
    });
  } catch (error) {
    console.error('[adminController.debitWallet] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Delete a user account and associated data
 * @route   DELETE /api/v1/admin/users/:id
 * @access  Private, Admin only
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const User = req.models.User;
    const Wallet = req.models.Wallet;
    const Transaction = req.models.Transaction;

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }

    // Delete associated records
    await Promise.all([
      Wallet.deleteOne({ user: id }),
      Transaction.deleteMany({ user: id }),
      User.deleteOne({ _id: id }),
    ]);

    console.log(`[adminController] Deleted user ${id} (${user.email}) and all associated data.`);

    res.status(200).json({
      status: 'success',
      message: `User ${user.fullName} (${user.email}) has been deleted along with all associated data.`,
    });
  } catch (error) {
    console.error('[adminController.deleteUser] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Sync all plans from Peyflex
// ---------------------------------------------------------------------------

/**
 * @desc    Fetch all plans from Peyflex and sync to ServicePlan DB
 * @route   POST /api/v1/admin/sync-plans
 * @access  Private, Admin only
 */
exports.syncPlans = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const AdminConfig = req.models.AdminConfig;

    if (!ServicePlan) {
      return res.status(500).json({
        status:  'error',
        message: 'ServicePlan model not found. Check tenant DB connection.',
      });
    }

    const results = await adminService.syncAllPlans(ServicePlan, { AdminConfig });

    res.status(200).json({
      status: 'success',
      data:   results,
      message: `Synced ${results.synced} plans, updated ${results.updated} existing, skipped ${results.skipped}. ${results.errors.length} errors.`,
    });

  } catch (error) {
    console.error('[adminController.syncPlans] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get all plans (admin view — shows both providerPrice and ourPrice)
// ---------------------------------------------------------------------------

/**
 * @desc    Get all service plans with pricing
 * @route   GET /api/v1/admin/plans
 * @access  Private, Admin only
 * @query   ?service=data&provider=mtn_gifting_data&page=1&limit=50
 */
exports.getAllPlans = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const { service, provider, page, limit } = req.query;

    const result = await adminService.getAllPlansForAdmin(ServicePlan, {
      service,
      provider,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 150, 200),
    });

    res.status(200).json({
      status: 'success',
      data:   result,
    });

  } catch (error) {
    console.error('[adminController.getAllPlans] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Update a single plan's price
// ---------------------------------------------------------------------------

/**
 * @desc    Update a plan's ourPrice
 * @route   PATCH /api/v1/admin/plans/:id
 * @access  Private, Admin only
 * @body    { ourPrice: number }
 */
exports.updatePlanPrice = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const { id } = req.params;
    const { ourPrice, isActive } = req.body;

    const updateData = {};
    if (ourPrice !== undefined) updateData.ourPrice = Number(ourPrice);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const plan = await ServicePlan.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!plan) {
      return res.status(404).json({
        status:  'fail',
        message: 'Plan not found.',
      });
    }

    res.status(200).json({
      status: 'success',
      data:   { plan },
    });

  } catch (error) {
    console.error('[adminController.updatePlanPrice] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Level-specific plan pricing
// ---------------------------------------------------------------------------

/**
 * @desc    Get level-specific prices for a plan
 * @route   GET /api/v1/admin/plans/:id/prices
 * @access  Private, Admin only
 */
exports.getPlanLevelPrices = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const { id } = req.params;

    const data = await adminService.getPlanLevelPrices(ServicePlan, id);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    console.error('[adminController.getPlanLevelPrices] error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      status: 'fail',
      message: error.message,
    });
  }
};

/**
 * @desc    Update level-specific prices for a plan
 * @route   PATCH /api/v1/admin/plans/:id/prices
 * @access  Private, Admin only
 * @body    { prices: { normal: 100, affiliate: 95, top_user: 90, api_user: 85 } }
 */
exports.updatePlanLevelPrices = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const { id } = req.params;
    const { prices } = req.body;

    if (!prices || typeof prices !== 'object') {
      return res.status(400).json({
        status: 'fail',
        message: 'prices object is required with level keys.',
      });
    }

    const data = await adminService.updatePlanLevelPrices(ServicePlan, id, prices);

    res.status(200).json({
      status: 'success',
      data,
      message: 'Level prices updated successfully.',
    });
  } catch (error) {
    console.error('[adminController.updatePlanLevelPrices] error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      status: 'fail',
      message: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// Bulk update prices
// ---------------------------------------------------------------------------

/**
 * @desc    Bulk update multiple plans' prices
 * @route   POST /api/v1/admin/plans/bulk-update
 * @access  Private, Admin only
 * @body    { updates: [{ service, provider, planCode, ourPrice }, ...] }
 */
exports.bulkUpdatePrices = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const { updates } = req.body;

    if (!Array.isArray(updates) || !updates.length) {
      return res.status(400).json({
        status:  'fail',
        message: 'updates must be a non-empty array.',
      });
    }

    const results = await adminService.bulkUpdatePrices(ServicePlan, updates);

    res.status(200).json({
      status: 'success',
      data:   results,
    });

  } catch (error) {
    console.error('[adminController.bulkUpdatePrices] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get summary (count by service)
// ---------------------------------------------------------------------------

/**
 * @desc    Sync DATA plans from provider
 * @route   POST /api/v1/admin/plans/sync/data
 * @access  Private, Admin only
 */
exports.syncDataPlans = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const AdminConfig = req.models.AdminConfig;
    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not found.' });
    }
    const results = await adminService.syncDataPlans(ServicePlan, { AdminConfig });
    res.status(200).json({
      status: 'success',
      data: results,
      message: `Synced ${results.synced} data plans, updated ${results.updated} existing, skipped ${results.skipped}. ${results.errors.length} errors.`,
    });
  } catch (error) {
    console.error('[adminController.syncDataPlans] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Sync CABLE plans from provider
 * @route   POST /api/v1/admin/plans/sync/cable
 * @access  Private, Admin only
 */
exports.syncCablePlans = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const AdminConfig = req.models.AdminConfig;
    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not found.' });
    }
    const results = await adminService.syncCablePlans(ServicePlan, { AdminConfig });
    res.status(200).json({
      status: 'success',
      data: results,
      message: `Synced ${results.synced} cable plans, ${results.skipped} skipped. ${results.errors.length} errors.`,
    });
  } catch (error) {
    console.error('[adminController.syncCablePlans] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Sync ELECTRICITY plans from provider
 * @route   POST /api/v1/admin/plans/sync/electricity
 * @access  Private, Admin only
 */
exports.syncElectricityPlans = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;
    const AdminConfig = req.models.AdminConfig;
    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not found.' });
    }
    const results = await adminService.syncElectricityPlans(ServicePlan, { AdminConfig });
    res.status(200).json({
      status: 'success',
      data: results,
      message: `Synced ${results.synced} electricity plans, ${results.updated} re-tagged to active provider, ${results.skipped} skipped. ${results.errors.length} errors.`,
    });
  } catch (error) {
    console.error('[adminController.syncElectricityPlans] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Get plan counts by service type
 * @route   GET /api/v1/admin/plans/summary
 * @access  Private, Admin only
 */
exports.getPlansSummary = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;

    const summary = await ServicePlan.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$service', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      status: 'success',
      data:   { summary },
    });

  } catch (error) {
    console.error('[adminController.getPlansSummary] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Airtime Profit Config (by level)
// ---------------------------------------------------------------------------

/**
 * @desc    Get airtime profit percentage by level
 * @route   GET /api/v1/admin/config/airtime-profit
 * @access  Private, Admin only
 */
exports.getAirtimeProfitConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const profitLevels = await adminService.getAirtimeProfitLevels(AdminConfig);

    res.status(200).json({
      status: 'success',
      data: { profitLevels },
    });
  } catch (error) {
    console.error('[adminController.getAirtimeProfitConfig] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Update airtime profit percentage by level
 * @route   PATCH /api/v1/admin/config/airtime-profit
 * @access  Private, Admin only
 * @body    { profitLevels: { normal: 2, affiliate: 1.5, top_user: 1, api_user: 0.5 } }
 */
exports.updateAirtimeProfitConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const { profitLevels } = req.body;

    if (!profitLevels || typeof profitLevels !== 'object') {
      return res.status(400).json({
        status: 'fail',
        message: 'profitLevels object is required with level keys.',
      });
    }

    const updated = await adminService.updateAirtimeProfitLevels(AdminConfig, profitLevels);

    res.status(200).json({
      status: 'success',
      data: { profitLevels: updated },
      message: 'Airtime profit levels updated successfully.',
    });
  } catch (error) {
    console.error('[adminController.updateAirtimeProfitConfig] error:', error.message);
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

/**
 * @desc    Get current provider mapping
 * @route   GET /api/v1/admin/config/providers
 * @access  Private, Admin only
 */
exports.getProviderConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const providerMap = await providerRegistry.getProviderMap(AdminConfig);
    const availableProviders = providerRegistry.getAvailableProviders();

    res.status(200).json({
      status: 'success',
      data: {
        providerMap,
        availableProviders,
      },
    });
  } catch (error) {
    console.error('[adminController.getProviderConfig] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Update provider mapping for services
 * @route   PATCH /api/v1/admin/config/providers
 * @access  Private, Admin only
 * @body    { airtime: "peyflex", data: "gladtidings", cable: "geodnatech", electricity: "datastation" }
 */
exports.updateProviderConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;

    if (!AdminConfig) {
      return res.status(500).json({ status: 'error', message: 'AdminConfig model not available.' });
    }

    const newMap = await providerRegistry.setProviderMap(AdminConfig, req.body);

    res.status(200).json({
      status: 'success',
      data: { providerMap: newMap },
      message: 'Provider configuration updated successfully.',
    });
  } catch (error) {
    console.error('[adminController.updateProviderConfig] error:', error.message);
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

/**
 * @desc    Get list of available provider names
 * @route   GET /api/v1/admin/config/providers/available
 * @access  Private, Admin only
 */
exports.getAvailableProviders = async (req, res) => {
  try {
    const availableProviders = providerRegistry.getAvailableProviders();

    res.status(200).json({
      status: 'success',
      data: { providers: availableProviders },
    });
  } catch (error) {
    console.error('[adminController.getAvailableProviders] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Reset provider mapping to defaults (all peyflex)
 * @route   DELETE /api/v1/admin/config/providers
 * @access  Private, Admin only
 */
exports.resetProviderConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const defaultMap = await providerRegistry.resetProviderMap(AdminConfig);

    res.status(200).json({
      status: 'success',
      data: { providerMap: defaultMap },
      message: 'Provider configuration reset to defaults (all peyflex).',
    });
  } catch (error) {
    console.error('[adminController.resetProviderConfig] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Monthly Profits
// ---------------------------------------------------------------------------

/**
 * @desc    Get profits grouped by month for a given year
 * @route   GET /api/v1/admin/profits/monthly
 * @access  Private, Admin only
 * @query   ?year=2026 (optional — defaults to current year)
 */
exports.getMonthlyProfits = async (req, res) => {
  try {
    const Transaction = req.models.Transaction;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const result = await Transaction.aggregate([
      {
        $match: {
          status: 'SUCCESS',
          type: { $in: ['AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            type: '$type',
          },
          totalProfit: { $sum: '$profit' },
        },
      },
      { $sort: { '_id.month': 1, '_id.type': 1 } },
    ]);

    // Build monthly breakdown: [{ month: 1, AIRTIME: 0, DATA: 0, CABLE: 0, ELECTRICITY: 0, total: 0 }, ...]
    const monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const entry = { month: m, AIRTIME: 0, DATA: 0, CABLE: 0, ELECTRICITY: 0, total: 0 };
      monthlyData.push(entry);
    }

    for (const row of result) {
      const m = row._id.month - 1; // 0-indexed
      const profitInNaira = row.totalProfit / 100;
      monthlyData[m][row._id.type] = profitInNaira;
      monthlyData[m].total += profitInNaira;
    }

    res.status(200).json({
      status: 'success',
      data: {
        year,
        months: monthlyData,
      },
    });
  } catch (error) {
    console.error('[adminController.getMonthlyProfits] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Manual Transfer Account Management
// ---------------------------------------------------------------------------

/**
 * @desc    Get all manual transfer bank accounts
 * @route   GET /api/v1/admin/config/manual-transfer-accounts
 * @access  Private, Admin only
 */
exports.getManualTransferAccounts = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;

    const config = await AdminConfig.findOne({ key: 'manual_transfer_accounts' });
    const accounts = config?.value || [];

    res.status(200).json({
      status: 'success',
      data: { accounts },
    });
  } catch (error) {
    console.error('[adminController.getManualTransferAccounts] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Add a new manual transfer bank account
 * @route   POST /api/v1/admin/config/manual-transfer-accounts
 * @access  Private, Admin only
 * @body    { bankName: string, accountNumber: string, accountName: string }
 */
exports.addManualTransferAccount = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const { bankName, accountNumber, accountName } = req.body;

    if (!bankName || !accountNumber || !accountName) {
      return res.status(400).json({
        status: 'fail',
        message: 'bankName, accountNumber, and accountName are required.',
      });
    }

    const newAccount = {
      _id: new (require('mongoose')).Types.ObjectId(),
      bankName,
      accountNumber,
      accountName,
      isActive: true,
      createdAt: new Date(),
    };

    const config = await AdminConfig.findOneAndUpdate(
      { key: 'manual_transfer_accounts' },
      {
        $push: { value: newAccount },
        $setOnInsert: {
          key: 'manual_transfer_accounts',
          description: 'Company bank accounts for manual transfer funding',
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      status: 'success',
      message: 'Manual transfer account added successfully.',
      data: { account: newAccount },
    });
  } catch (error) {
    console.error('[adminController.addManualTransferAccount] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Update a manual transfer bank account
 * @route   PUT /api/v1/admin/config/manual-transfer-accounts/:id
 * @access  Private, Admin only
 * @body    { bankName?, accountNumber?, accountName?, isActive? }
 */
exports.updateManualTransferAccount = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const { id } = req.params;
    const updates = req.body;

    const config = await AdminConfig.findOne({ key: 'manual_transfer_accounts' });
    if (!config) {
      return res.status(404).json({ status: 'fail', message: 'No manual transfer accounts found.' });
    }

    const accounts = config.value || [];
    const accountIndex = accounts.findIndex(acc => String(acc._id || acc.id) === String(id));

    if (accountIndex === -1) {
      return res.status(404).json({ status: 'fail', message: 'Account not found.' });
    }

    // Update fields
    const allowedFields = ['bankName', 'accountNumber', 'accountName', 'isActive'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        accounts[accountIndex][field] = updates[field];
      }
    }

    config.markModified('value');
    await config.save();

    res.status(200).json({
      status: 'success',
      message: 'Manual transfer account updated successfully.',
      data: { account: accounts[accountIndex] },
    });
  } catch (error) {
    console.error('[adminController.updateManualTransferAccount] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Delete a manual transfer bank account
 * @route   DELETE /api/v1/admin/config/manual-transfer-accounts/:id
 * @access  Private, Admin only
 */
exports.deleteManualTransferAccount = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    const { id } = req.params;

    const config = await AdminConfig.findOne({ key: 'manual_transfer_accounts' });
    if (!config) {
      return res.status(404).json({ status: 'fail', message: 'No manual transfer accounts found.' });
    }

    const accounts = config.value || [];
    const filteredAccounts = accounts.filter(acc => String(acc._id || acc.id) !== String(id));

    if (filteredAccounts.length === accounts.length) {
      return res.status(404).json({ status: 'fail', message: 'Account not found.' });
    }

    config.value = filteredAccounts;
    config.markModified('value');
    await config.save();

    res.status(200).json({
      status: 'success',
      message: 'Manual transfer account deleted successfully.',
    });
  } catch (error) {
    console.error('[adminController.deleteManualTransferAccount] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Manual Funding Management (approve/reject user manual transfer notifications)
// ---------------------------------------------------------------------------

/**
 * @desc    Get all pending MANUAL_FUNDING transactions
 * @route   GET /api/v1/admin/transactions/manual-funding
 * @access  Private, Admin only
 */
exports.getPendingManualFunding = async (req, res) => {
  try {
    const Transaction = req.models.Transaction;
    const { page = 1, limit = 50, status } = req.query;

    const query = { type: 'MANUAL_FUNDING' };
    if (status) {
      query.status = status;
    } else {
      query.status = 'PENDING'; // default to pending
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'fullName email phone')
      .lean();

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: { transactions, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[adminController.getPendingManualFunding] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Approve a manual funding transaction (credit wallet)
 * @route   POST /api/v1/admin/wallets/approve-manual-funding
 * @access  Private, Admin only
 * @body    { transactionId: string, note?: string }
 */
exports.approveManualFunding = async (req, res) => {
  try {
    const { transactionId, note } = req.body;
    const Transaction = req.models.Transaction;
    const Wallet = req.models.Wallet;

    if (!transactionId) {
      return res.status(400).json({
        status: 'fail',
        message: 'transactionId is required.',
      });
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ status: 'fail', message: 'Transaction not found.' });
    }

    if (transaction.type !== 'MANUAL_FUNDING') {
      return res.status(400).json({
        status: 'fail',
        message: 'Transaction is not a manual funding request.',
      });
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({
        status: 'fail',
        message: `Transaction is already ${transaction.status}. Cannot approve.`,
      });
    }

    const userId = transaction.user;
    const amountKobo = transaction.amount;

    // Find wallet
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ status: 'fail', message: 'Wallet not found for this user.' });
    }

    const previousBalance = wallet.balance;

    // Credit wallet atomically
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: amountKobo } },
      { new: true }
    );

    // Update transaction status
    await Transaction.findByIdAndUpdate(transactionId, {
      status: 'SUCCESS',
      previousBalance,
      newBalance: updatedWallet.balance,
      note: note || 'Manual transfer approved by admin',
    });

    res.status(200).json({
      status: 'success',
      message: `Manual transfer approved. ₦${(amountKobo / 100).toLocaleString()} credited to user.`,
      data: {
        transactionId,
        amountNaira: amountKobo / 100,
        previousBalance: previousBalance / 100,
        newBalance: updatedWallet.balance / 100,
      },
    });
  } catch (error) {
    console.error('[adminController.approveManualFunding] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};
