const express = require('express');
const authController = require('../controllers/authController');
// Import middleware just for the 'me' route
const { protect } = require('../middleware/authMiddleware');
const tenantMiddleware = require('../middleware/tenantMiddleware')

const router = express.Router();

// --- Public Routes ---
router.post('/register', authController.register);
router.post('/login', tenantMiddleware, authController.login);

// --- Protected Routes ---
// Although it's an auth check, getting current user info requires being logged in.
router.get('/me', protect, authController.getMe);

module.exports = router;