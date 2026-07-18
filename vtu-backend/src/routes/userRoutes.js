'use strict';

// src/routes/userRoutes.js

const express               = require('express');
const router                = express.Router();
const authMiddleware        = require('../middleware/authMiddleware');
const walletController      = require('../controllers/walletController');
const authController        = require('../controllers/authController');
const userController        = require('../controllers/userController');
const transactionController = require('../controllers/transactionController');
const notificationController = require('../controllers/notificationController');

// Apply protect to ALL routes in this file
router.use(authMiddleware.protect);

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
router.get('/wallet/balance',  walletController.getWallet);
router.post('/wallet/fund',    walletController.initiateFunding);
router.post('/wallet/verify',  walletController.verifyFunding);

// Dedicated Virtual Account (DVA) — bank transfer funding
router.get('/wallet/account-details',     walletController.getAccountDetails);
router.post('/wallet/provision-account',  authController.retryProvisionDedicatedAccount);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
router.patch('/update-password', authController.updatePassword);

// ---------------------------------------------------------------------------
// User profile & PIN
// ---------------------------------------------------------------------------
router.get('/dashboard/data',            userController.getDashboardData);
router.post('/set-transaction-pin',      userController.setTransactionPin);
router.patch('/update-transaction-pin',  userController.updateTransactionPin);
router.patch('/profile/update',          userController.updateProfile);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
router.get('/transactions/my-history', transactionController.getMyHistory);

// ---------------------------------------------------------------------------
// Push Notifications
// ---------------------------------------------------------------------------
router.post('/notifications/register',   notificationController.registerToken);
router.post('/notifications/unregister', notificationController.unregisterToken);
router.post('/notifications/test',       notificationController.sendTestNotification);

module.exports = router;
