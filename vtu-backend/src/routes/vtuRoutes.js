'use strict';

// src/routes/vtuRoutes.js

const express       = require('express');
const router        = express.Router();
const { protect }   = require('../middleware/authMiddleware');
const verifyPin     = require('../middleware/verifyPin');
const vtuController = require('../controllers/vtuController');

// All VTU routes require authentication
router.use(protect);

// ---------------------------------------------------------------------------
// Plans from DB — user-facing (returns ourPrice)
// GET /api/v1/vtu/plans?service=data&provider=mtn_gifting_data
// GET /api/v1/vtu/plans?service=cable&provider=dstv
// GET /api/v1/vtu/plans?service=electricity
// ---------------------------------------------------------------------------
router.get('/plans', vtuController.getPlans);

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------
router.get('/airtime/networks',   vtuController.getAirtimeNetworks);
router.post('/airtime/buy',       verifyPin, vtuController.buyAirtime);

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
router.get('/data/networks',        vtuController.getDataNetworks);
router.get('/data/plans/:network',  vtuController.getDataPlans);     // kept for backward compat
router.post('/data/buy',            verifyPin, vtuController.buyData);

// ---------------------------------------------------------------------------
// Cable
// ---------------------------------------------------------------------------
router.get('/cable/providers',          vtuController.getCableProviders);
router.get('/cable/plans/:identifier',  vtuController.getCablePlans);   // kept for backward compat
router.post('/cable/verify',            vtuController.verifyCableIUC);
router.post('/cable/subscribe',         verifyPin, vtuController.subscribeCable);

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------
router.get('/electricity/plans',    vtuController.getElectricityPlans);
router.get('/electricity/verify',   vtuController.verifyMeter);
router.post('/electricity/buy',     verifyPin, vtuController.buyElectricity);

module.exports = router;