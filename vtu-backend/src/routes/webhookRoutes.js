// src/routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Route for Paystack webhooks
router.post('/paystack', webhookController.handlePaystackWebhook);

// Add routes for other gateways here (e.g., router.post('/flutterwave', ...))

module.exports = router;