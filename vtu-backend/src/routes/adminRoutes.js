const express = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- CRITICAL SECURITY ---
// Apply BOTH protect AND restrictTo middleware.
// 1. User must be logged in.
// 2. User must have role 'admin' (or 'superadmin').
router.use(authMiddleware.protect, authMiddleware.restrictTo('admin', 'superadmin'));

// --- User Management ---

// GET /api/v1/admin/users (Supports pagination: ?page=1&limit=20)
router.get('/users', adminController.getAllUsers);

// GET /api/v1/admin/users/:id (Get specific user + their wallet info)
router.get('/users/:id', adminController.getUserDetails);

// PATCH /api/v1/admin/users/:id/ban (Example future endpoint)
router.patch('/users/:id/ban', adminController.banUser);


// --- Transaction Monitoring ---

// GET /api/v1/admin/transactions (Supports filtering & pagination)
// Example: /api/v1/admin/transactions?status=failed&type=airtime
router.get('/transactions', adminController.getAllTransactions);


module.exports = router;