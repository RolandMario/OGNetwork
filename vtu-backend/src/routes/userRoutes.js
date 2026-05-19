const express = require('express');
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');
const transactionController = require('../controllers/transactionController');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController')

const router = express.Router();

// Apply 'protect' middleware to ALL routes in this file
router.use(authMiddleware.protect);

// --- Wallet Endpoints ---

// GET /api/v1/user/wallet/balance
router.get('/wallet/balance',  walletController.getBalance);
router.get('dashboard/data', userController.getDashboardData)

// POST /api/v1/user/wallet/fund (Initiate payment)
router.post('/wallet/fund', walletController.initiateFunding);
router.post('/wallet/verify', walletController.verifyFunding)
router.post('/set-transaction-pin', userController.setTransactionPin);
router.patch('/update-transaction-pin', userController.updateTransactionPin)

// --- Other User Endpoints (Examples for future expansion) ---
router.get('/transactions/my-history', transactionController.getMyHistory);
router.patch('/profile/update', userController.updateProfile);
router.patch('/update-password', authController.updatePassword);

module.exports = router;