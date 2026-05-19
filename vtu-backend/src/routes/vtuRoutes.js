const express = require('express');
// Assuming vtuController exists based on earlier conceptual design
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
const vtuController = require('../controllers/vtuController');
const authMiddleware = require('../middleware/authMiddleware');
const tenantMiddleware = require('../middleware/tenantMiddleware')

const router = express.Router();

// Apply 'protect' middleware to ALL routes in this file.
// A user must be logged in to buy anything.
router.use(authMiddleware.protect);
// console.log('middleware protection executed')
// router.use(tenantMiddleware)
// --- Airtime ---
// POST /api/v1/vtu/airtime
// Body expected: { phone: '08012345678', amount: 500, network: 'mtn' }
router.post('/airtime',  vtuController.handleAirtimePurchase);

// --- Data ---
// POST /api/v1/vtu/data
// Body expected: { phone: '08012345678', planId: 'mtn-1gb-monthly', network: 'mtn' }
router.post('/data', vtuController.handleDataPurchase);

router.get('/networks', vtuController.fetchNetworks);
router.get('/data-plans', vtuController.fetchDataPlans)
router.get('/airtime-networks', vtuController.getAirtimeDetails)
// --- Cable TV ---
// POST /api/v1/vtu/cable
// Body expected: { smartCardNumber: '1234567890', planId: 'dstv-premium', provider: 'dstv' }

router.get('/cable-types', vtuController.handleCableTypes)
router.post('/cable', vtuController.purchaseCable);
router.get('/cable-packages', vtuController.handleCablePackages)
router.post('/verify-smartcard-no', vtuController.verifySmartCardNo)
router.post('/buy-cable', vtuController.purchaseCable)
// --- Utilities (Lookup) ---
// GET /api/v1/vtu/lookup/meter?number=12345&provider=ikeja
router.get('/lookup/meter', vtuController.validateMeterNumber);

module.exports = router;