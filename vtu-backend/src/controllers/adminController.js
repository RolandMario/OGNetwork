'use strict';

// src/controllers/adminController.js

const adminService = require('../services/adminService');

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * @desc    Get dashboard overview stats
 * @route   GET /api/v1/admin/dashboard
 * @access  Private, Admin only
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

    // Calculate profits grouped by service type
    const profitResult = await Transaction.aggregate([
      { $match: { status: 'SUCCESS', type: { $in: ['AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'] } } },
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

    if (!ServicePlan) {
      return res.status(500).json({
        status:  'error',
        message: 'ServicePlan model not found. Check tenant DB connection.',
      });
    }

    const results = await adminService.syncAllPlans(ServicePlan);

    res.status(200).json({
      status: 'success',
      data:   results,
      message: `Synced ${results.synced} plans, skipped ${results.skipped} existing. ${results.errors.length} errors.`,
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
    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not found.' });
    }
    const results = await adminService.syncDataPlans(ServicePlan);
    res.status(200).json({
      status: 'success',
      data: results,
      message: `Synced ${results.synced} data plans, ${results.skipped} skipped. ${results.errors.length} errors.`,
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
    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not found.' });
    }
    const results = await adminService.syncCablePlans(ServicePlan);
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
    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not found.' });
    }
    const results = await adminService.syncElectricityPlans(ServicePlan);
    res.status(200).json({
      status: 'success',
      data: results,
      message: `Synced ${results.synced} electricity plans, ${results.skipped} skipped. ${results.errors.length} errors.`,
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
// Airtime Profit Config
// ---------------------------------------------------------------------------

/**
 * @desc    Get airtime profit percentage
 * @route   GET /api/v1/admin/config/airtime-profit
 * @access  Private, Admin only
 */
exports.getAirtimeProfitConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    if (!AdminConfig) {
      return res.status(200).json({ status: 'success', data: { profitPercent: 0 } });
    }

    const config = await AdminConfig.findOne({ key: 'airtimeProfitPercent' });
    const profitPercent = config ? Number(config.value) : 0;

    res.status(200).json({
      status: 'success',
      data: { profitPercent },
    });
  } catch (error) {
    console.error('[adminController.getAirtimeProfitConfig] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Update airtime profit percentage
 * @route   PATCH /api/v1/admin/config/airtime-profit
 * @access  Private, Admin only
 * @body    { profitPercent: number }
 */
exports.updateAirtimeProfitConfig = async (req, res) => {
  try {
    const AdminConfig = req.models.AdminConfig;
    if (!AdminConfig) {
      return res.status(500).json({ status: 'error', message: 'AdminConfig model not available.' });
    }

    const { profitPercent } = req.body;

    if (profitPercent === undefined || profitPercent < 0 || profitPercent > 100) {
      return res.status(400).json({
        status: 'fail',
        message: 'profitPercent must be a number between 0 and 100.',
      });
    }

    const config = await AdminConfig.findOneAndUpdate(
      { key: 'airtimeProfitPercent' },
      { key: 'airtimeProfitPercent', value: Number(profitPercent), description: 'Airtime profit percentage (0-100)' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      status: 'success',
      data: { profitPercent: Number(config.value) },
      message: `Airtime profit percentage updated to ${profitPercent}%.`,
    });
  } catch (error) {
    console.error('[adminController.updateAirtimeProfitConfig] error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};
