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
router.patch('/users/:id/level', adminController.updateUserLevel);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
router.get('/transactions', adminController.getTransactions);

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------
router.get('/wallets', adminController.getWallets);
router.post('/wallets/fund', adminController.fundWallet);
router.post('/wallets/debit', adminController.debitWallet);

// ---------------------------------------------------------------------------
// User Management (additional)
// ---------------------------------------------------------------------------
router.delete('/users/:id', adminController.deleteUser);

// ---------------------------------------------------------------------------
// Monthly Profits
// ---------------------------------------------------------------------------
router.get('/profits/monthly', adminController.getMonthlyProfits);

// ---------------------------------------------------------------------------
// Provider wallet balances
// ---------------------------------------------------------------------------
router.get('/providers/balances', adminController.getProviderBalances);

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

// Level-specific plan pricing
router.get('/plans/:id/prices', adminController.getPlanLevelPrices);
router.patch('/plans/:id/prices', adminController.updatePlanLevelPrices);

// Bulk update plan prices
router.post('/plans/bulk-update', adminController.bulkUpdatePrices);

// ---------------------------------------------------------------------------
// Airtime Profit Config
// ---------------------------------------------------------------------------
router.get('/config/airtime-profit', adminController.getAirtimeProfitConfig);
router.patch('/config/airtime-profit', adminController.updateAirtimeProfitConfig);

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

// Get current provider mapping
router.get('/config/providers', adminController.getProviderConfig);

// Update provider mapping
router.patch('/config/providers', adminController.updateProviderConfig);

// Get list of available providers
router.get('/config/providers/available', adminController.getAvailableProviders);

// Reset provider mapping to defaults
router.delete('/config/providers', adminController.resetProviderConfig);

// ---------------------------------------------------------------------------
// Manual Transfer Account Management
// ---------------------------------------------------------------------------

// Get all manual transfer bank accounts
router.get('/config/manual-transfer-accounts', adminController.getManualTransferAccounts);

// Add a new manual transfer bank account
router.post('/config/manual-transfer-accounts', adminController.addManualTransferAccount);

// Update a manual transfer bank account
router.put('/config/manual-transfer-accounts/:id', adminController.updateManualTransferAccount);

// Delete a manual transfer bank account
router.delete('/config/manual-transfer-accounts/:id', adminController.deleteManualTransferAccount);

// ---------------------------------------------------------------------------
// Manual Funding Management (approve/reject user manual transfer notifications)
// ---------------------------------------------------------------------------

// Get pending manual funding transactions
router.get('/transactions/manual-funding', adminController.getPendingManualFunding);

// Approve a manual funding transaction (credit wallet)
router.post('/wallets/approve-manual-funding', adminController.approveManualFunding);

// ---------------------------------------------------------------------------
// Notifications (admin broadcast)
// ---------------------------------------------------------------------------

// Send a notification to all users (or a specific user)
router.post('/notifications', adminController.sendNotification);

// Broadcast history (one row per send)
router.get('/notifications', adminController.getSentNotifications);

module.exports = router;
