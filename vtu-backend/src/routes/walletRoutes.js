'use strict';

// src/routes/walletRoutes.js
//
// New payment gateway routes (Monnify + Manual Transfer).
// Existing Paystack/DVA routes are in userRoutes.js.

const express       = require('express');
const router        = express.Router();
const walletController = require('../controllers/walletController');
const commissionController = require('../controllers/commissionController');
const { protect }   = require('../middleware/authMiddleware');
const verifyPin     = require('../middleware/verifyPin');

// All wallet routes require authentication
router.use(protect);

// ---------------------------------------------------------------------------
// Monnify routes
// ---------------------------------------------------------------------------

// POST /wallet/fund/monnify — initiate Monnify funding
router.post('/fund/monnify', walletController.initiateMonnifyFunding);

// POST /wallet/verify/monnify — verify Monnify payment
router.post('/verify/monnify', walletController.verifyMonnifyFunding);

// ---------------------------------------------------------------------------
// Manual Transfer routes
// ---------------------------------------------------------------------------

// GET  /wallet/manual-transfer-accounts — get company bank accounts
router.get('/manual-transfer-accounts', walletController.getManualTransferAccounts);

// POST /wallet/manual-transfer-notify — notify admin of manual transfer
router.post('/manual-transfer-notify', walletController.notifyManualTransfer);

// ---------------------------------------------------------------------------
// Commission routes
// ---------------------------------------------------------------------------

// GET  /wallet/commission — commission balance + history
router.get('/commission', commissionController.getCommission);

// POST /wallet/commission/withdraw — move commission to main wallet (PIN required)
router.post('/commission/withdraw', verifyPin, commissionController.withdrawCommission);

module.exports = router;