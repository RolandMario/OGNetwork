const express = require('express');
const authController = require('../controllers/authController');
// Import middleware
const { protect } = require('../middleware/authMiddleware');
const authTenantMiddleware = require('../middleware/authTenantMiddleware');

const router = express.Router();

// --- Public Routes ---
// These routes accept tenantId from header, query, or body
router.post('/register', authTenantMiddleware, authController.register);
router.post('/login', authTenantMiddleware, authController.login);

// --- Protected Routes ---
// These routes require authentication
router.get('/me', protect, authController.getMe);

module.exports = router;