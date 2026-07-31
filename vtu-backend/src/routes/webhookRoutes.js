// src/routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Route for Paystack webhooks
router.post('/paystack', webhookController.handlePaystackWebhook);

// Route for Monnify webhooks
router.post('/monnify', webhookController.handleMonnifyWebhook);

module.exports = router;
