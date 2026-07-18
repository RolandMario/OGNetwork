'use strict';

// src/routes/walletRoutes.js

const express       = require('express');
const router        = express.Router();
const walletController = require('../controllers/walletController');
const { protect }   = require('../middleware/authMiddleware');

// All wallet routes require authentication
router.use(protect);

// GET  /api/v1/wallet          — get balance + recent transactions
router.get('/', walletController.getWallet);

// POST /api/v1/wallet/fund     — initiate Paystack funding
router.post('/fund', walletController.initiateFunding);

// GET  /api/v1/wallet/verify/:reference — verify payment after callback
router.get('/verify/:reference', walletController.verifyFunding);

module.exports = router;