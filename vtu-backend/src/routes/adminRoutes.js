'use strict';

// src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const restrictAdmin = require('../middleware/restrictAdmin');
const adminController = require('../controllers/adminController');

// All admin routes require authentication + admin role
router.use(authMiddleware.protect);
router.use(restrictAdmin);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
router.get('/dashboard', adminController.getDashboard);

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------
router.get('/users', adminController.getUsers);
router.patch('/users/:id/status', adminController.toggleUserStatus);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
router.get('/transactions', adminController.getTransactions);

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------
router.get('/wallets', adminController.getWallets);

// ---------------------------------------------------------------------------
// Plan Management
// ---------------------------------------------------------------------------

// Sync plans from Peyflex

// Get all plans (with pricing info)
router.get('/plans', adminController.getAllPlans);

router.post('/plans/sync-plans', adminController.syncPlans);
router.post('/plans/sync/data', adminController.syncDataPlans);
router.post('/plans/sync/cable', adminController.syncCablePlans);
router.post('/plans/sync/electricity', adminController.syncElectricityPlans);



// Get summary (counts by service)
router.get('/plans/summary', adminController.getPlansSummary);

// Update single plan price
router.patch('/plans/:id', adminController.updatePlanPrice);

// Bulk update plan prices
router.post('/plans/bulk-update', adminController.bulkUpdatePrices);

// ---------------------------------------------------------------------------
// Airtime Profit Config
// ---------------------------------------------------------------------------
router.get('/config/airtime-profit', adminController.getAirtimeProfitConfig);
router.patch('/config/airtime-profit', adminController.updateAirtimeProfitConfig);

module.exports = router;
