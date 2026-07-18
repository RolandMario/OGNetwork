'use strict';

// src/controllers/vtuController.js

const vtuService = require('../services/vtuService');

// ---------------------------------------------------------------------------
// Helper — debit wallet and create a PENDING transaction
// ---------------------------------------------------------------------------
async function debitWalletAndCreateTx({ userId, amountNaira, type, details, Wallet, Transaction }) {
  const amountKobo = Math.round(amountNaira * 100);

  const wallet = await Wallet.findOne({ user: userId });
  if (!wallet) throw Object.assign(new Error('Wallet not found.'), { statusCode: 404 });

  if (wallet.balance < amountKobo) {
    throw Object.assign(
      new Error(`Insufficient balance. Required: ₦${amountNaira}, Available: ₦${wallet.balance / 100}`),
      { statusCode: 400 }
    );
  }

  const reference = `OGN-VTU-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const updatedWallet = await Wallet.findOneAndUpdate(
    { user: userId, balance: { $gte: amountKobo } },
    { $inc: { balance: -amountKobo } },
    { new: true }
  );

  if (!updatedWallet) {
    throw Object.assign(new Error('Insufficient balance or wallet not found.'), { statusCode: 400 });
  }

  const transaction = await Transaction.create({
    user:                 userId,
    type,
    amount:               amountKobo,
    status:               'PENDING',
    transactionReference: reference,
    previousBalance:      wallet.balance,
    newBalance:           updatedWallet.balance,
    details,
  });

  return { transaction, reference, previousBalance: wallet.balance, newBalance: updatedWallet.balance };
}

// ---------------------------------------------------------------------------
// Helper — reverse a wallet debit and mark transaction FAILED
// ---------------------------------------------------------------------------
async function reverseAndFail({ transaction, previousBalance, Wallet, Transaction, reason }) {
  try {
    await Wallet.findOneAndUpdate(
      { user: transaction.user },
      { $inc: { balance: transaction.amount } }
    );

    await Transaction.findOneAndUpdate(
      { _id: transaction._id },
      {
        status:     'FAILED',
        newBalance: previousBalance,
        details:    { ...transaction.details, failureReason: reason },
      }
    );

    console.log(`[vtuController] Reversed ₦${transaction.amount / 100} for user ${transaction.user} — ${reason}`);
  } catch (err) {
    console.error('[vtuController] CRITICAL: Reversal failed!', err.message, 'Transaction:', transaction._id);
  }
}

// ---------------------------------------------------------------------------
// Helper — lookup plan from DB, validate it exists
// ---------------------------------------------------------------------------
async function lookupPlan(ServicePlan, { service, provider, planCode }) {
  if (!ServicePlan) {
    throw Object.assign(
      new Error('ServicePlan model not available. Run sync first.'),
      { statusCode: 500 }
    );
  }

  const plan = await ServicePlan.findOne({ service, provider, planCode, isActive: true });

  if (!plan) {
    throw Object.assign(
      new Error(`Plan not found: ${service}/${provider}/${planCode}. It may not be synced yet.`),
      { statusCode: 404 }
    );
  }

  return plan;
}

// ---------------------------------------------------------------------------
// GET /api/v1/vtu/plans — User-facing plans from DB (returns ourPrice)
// ---------------------------------------------------------------------------

/**
 * @desc    Get plans from DB for a service/provider — returns ourPrice (not providerPrice)
 * @route   GET /api/v1/vtu/plans?service=data&provider=mtn_gifting_data
 * @access  Private
 */
exports.getPlans = async (req, res) => {
  try {
    const { service, provider } = req.query;
    const ServicePlan = req.models.ServicePlan;

    if (!service) {
      return res.status(400).json({ status: 'fail', message: 'service query param is required.' });
    }

    if (!ServicePlan) {
      return res.status(500).json({ status: 'error', message: 'ServicePlan model not available.' });
    }

    const filter = { isActive: true, service };
    if (provider) filter.provider = provider;

    const plans = await ServicePlan.find(filter)
      .select('service provider planCode planName description ourPrice metadata')
      .sort({ provider: 1, ourPrice: 1 })
      .lean();

    // Group by provider if no specific provider requested
    let responseData;
    if (provider) {
      responseData = { plans };
    } else {
      // Group plans by provider
      const grouped = plans.reduce((acc, plan) => {
        if (!acc[plan.provider]) acc[plan.provider] = [];
        acc[plan.provider].push(plan);
        return acc;
      }, {});
      responseData = { grouped, plans };
    }

    res.status(200).json({
      status: 'success',
      data:   responseData,
    });

  } catch (error) {
    console.error('getPlans error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Lookup helpers — still needed for providers list and IUC verify
// ---------------------------------------------------------------------------

exports.getAirtimeNetworks = async (req, res) => {
  try {
    const data = await vtuService.getAirtimeNetworks();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getDataNetworks = async (req, res) => {
  try {
    const data = await vtuService.getDataNetworks();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getDataPlans = async (req, res) => {
  try {
    const { network } = req.params;
    const data = await vtuService.getDataPlans(network);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getCableProviders = async (req, res) => {
  try {
    const data = await vtuService.getCableProviders();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getCablePlans = async (req, res) => {
  try {
    const { identifier } = req.params;
    const data = await vtuService.getCablePlans(identifier);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.verifyCableIUC = async (req, res) => {
  try {
    const { iuc, identifier } = req.body;
    if (!iuc || !identifier) {
      return res.status(400).json({ status: 'fail', message: 'iuc and identifier are required.' });
    }
    const data = await vtuService.verifyCableIUC({ iuc, identifier });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Electricity — lookup + verify
// ---------------------------------------------------------------------------

/**
 * @desc    Get electricity providers from DB
 * @route   GET /api/v1/vtu/electricity/plans
 * @access  Private
 */
exports.getElectricityPlans = async (req, res) => {
  try {
    const ServicePlan = req.models.ServicePlan;

    if (ServicePlan) {
      // Return from DB (with ourPrice)
      const plans = await ServicePlan.find({ service: 'electricity', isActive: true })
        .select('planCode planName description ourPrice metadata')
        .sort({ planName: 1 })
        .lean();

      if (plans.length) {
        return res.status(200).json({ status: 'success', data: { plans } });
      }
    }

    // Fallback to Peyflex directly if DB empty
    const data = await vtuService.getElectricityPlans();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Verify electricity meter number
 * @route   GET /api/v1/vtu/electricity/verify
 * @access  Private
 * @query   ?meter=1234567890&plan=ikeja-electric&type=prepaid
 */
exports.verifyMeter = async (req, res) => {
  try {
    const { meter, plan, type = 'prepaid' } = req.query;

    if (!meter || !plan) {
      return res.status(400).json({ status: 'fail', message: 'meter and plan are required.' });
    }

    const data = await vtuService.verifyMeter({ meter, plan, type });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Purchase — Airtime (unchanged — no plan lookup needed)
// ---------------------------------------------------------------------------

/**
 * @desc    Buy airtime
 * @route   POST /api/v1/vtu/airtime/buy
 * @access  Private
 * @body    { network, amount, mobile_number }
 */
exports.buyAirtime = async (req, res) => {
  console.log("Buy airtime begins....")
  const { network, amount, mobile_number } = req.body;
  const { Transaction, Wallet } = req.models;
  const userId = req.user.id;

  if (!network || !amount || !mobile_number) {
    return res.status(400).json({ status: 'fail', message: 'network, amount and mobile_number are required.' });
  }

  if (Number(amount) < 50) {
    return res.status(400).json({ status: 'fail', message: 'Minimum airtime amount is ₦50.' });
  }

  let txData = null;

  try {
    txData = await debitWalletAndCreateTx({
      userId,
      amountNaira: Number(amount),
      type:        'AIRTIME',
      details:     { beneficiary: mobile_number, network },
      Wallet,
      Transaction,
    });

    const providerResponse = await vtuService.purchaseAirtime({ network, amount: Number(amount), mobile_number });

    // Calculate airtime profit based on configured percentage
    let airtimeProfitKobo = 0;
    try {
      const AdminConfig = req.models.AdminConfig;
      if (AdminConfig) {
        const config = await AdminConfig.findOne({ key: 'airtimeProfitPercent' });
        const profitPercent = config ? Number(config.value) : 0;
        airtimeProfitKobo = Math.round(Number(amount) * 100 * (profitPercent / 100));
      }
    } catch (err) {
      console.error('[vtuController] Error fetching airtime profit config:', err.message);
    }

    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      {
        status: 'SUCCESS',
        providerRef: String(providerResponse.transaction_id),
        newBalance: txData.newBalance,
        profit: airtimeProfitKobo,
      }
    );

    res.status(200).json({
      status:  'success',
      message: `₦${amount} airtime sent to ${mobile_number}`,
      data: {
        reference:     txData.reference,
        network,
        mobile_number,
        amount,
        newBalance:    txData.newBalance / 100,
        providerRef:   providerResponse.transaction_id,
      },
    });

  } catch (error) {
    console.error('buyAirtime error:', error.message);
    if (txData) await reverseAndFail({ transaction: txData.transaction, previousBalance: txData.previousBalance, Wallet, Transaction, reason: error.message });
    res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Purchase — Data (NOW uses DB plan — debit ourPrice, call Peyflex at providerPrice)
// ---------------------------------------------------------------------------

/**
 * @desc    Buy data bundle
 * @route   POST /api/v1/vtu/data/buy
 * @access  Private
 * @body    { network, plan_code, mobile_number }
 *
 * NOTE: amount is no longer sent from the frontend.
 *       We look up ourPrice from DB and debit that.
 *       Peyflex is called at their providerPrice (plan_code determines it on their end).
 */
exports.buyData = async (req, res) => {
  const { network, plan_code, mobile_number } = req.body;
  const { Transaction, Wallet, ServicePlan } = req.models;
  const userId = req.user.id;

  if (!network || !plan_code || !mobile_number) {
    return res.status(400).json({
      status:  'fail',
      message: 'network, plan_code and mobile_number are required.',
    });
  }

  let txData = null;

  try {
    // 1. Look up plan from DB — get ourPrice (what user pays)
    const plan = await lookupPlan(ServicePlan, {
      service:  'data',
      provider: network,
      planCode: plan_code,
    });

    // 2. Debit user at ourPrice
    txData = await debitWalletAndCreateTx({
      userId,
      amountNaira: plan.ourPrice,
      type:        'DATA',
      details:     { beneficiary: mobile_number, network, planId: plan_code, planName: plan.planName },
      Wallet,
      Transaction,
    });

    // 3. Call Peyflex — they charge at providerPrice via plan_code
    const providerResponse = await vtuService.purchaseData({ network, plan_code, mobile_number });

    // 4. Calculate profit = (ourPrice - providerPrice) * 100 (in kobo)
    const dataProfitKobo = Math.round((plan.ourPrice - plan.providerPrice) * 100);

    // 5. Mark SUCCESS with profit
    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      {
        status: 'SUCCESS',
        providerRef: String(providerResponse.transaction_id || ''),
        newBalance: txData.newBalance,
        profit: dataProfitKobo,
      }
    );

    res.status(200).json({
      status:  'success',
      message: `Data bundle sent to ${mobile_number}`,
      data: {
        reference:     txData.reference,
        network,
        plan_code,
        planName:      plan.planName,
        mobile_number,
        amount:        plan.ourPrice,
        newBalance:    txData.newBalance / 100,
      },
    });

  } catch (error) {
    console.error('buyData error:', error.message);
    if (txData) await reverseAndFail({ transaction: txData.transaction, previousBalance: txData.previousBalance, Wallet, Transaction, reason: error.message });
    res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Purchase — Cable (NOW uses DB plan)
// ---------------------------------------------------------------------------

/**
 * @desc    Subscribe cable TV
 * @route   POST /api/v1/vtu/cable/subscribe
 * @access  Private
 * @body    { identifier, plan, iuc, phone }
 *
 * NOTE: amount no longer needed from frontend — looked up from DB.
 */
exports.subscribeCable = async (req, res) => {
  const { identifier, plan, iuc, phone } = req.body;
  const { Transaction, Wallet, ServicePlan } = req.models;
  const userId = req.user.id;

  if (!identifier || !plan || !iuc || !phone) {
    return res.status(400).json({
      status:  'fail',
      message: 'identifier, plan, iuc and phone are required.',
    });
  }

  let txData = null;

  try {
    // 1. Look up plan from DB
    const dbPlan = await lookupPlan(ServicePlan, {
      service:  'cable',
      provider: identifier,
      planCode: plan,
    });

    // 2. Debit user at ourPrice
    txData = await debitWalletAndCreateTx({
      userId,
      amountNaira: dbPlan.ourPrice,
      type:        'CABLE',
      details:     { beneficiary: iuc, network: identifier, planId: plan, planName: dbPlan.planName },
      Wallet,
      Transaction,
    });

    // 3. Call Peyflex at providerPrice (amount determined by plan on their end)
    const providerResponse = await vtuService.subscribeCable({
      identifier,
      plan,
      iuc,
      phone,
      amount: dbPlan.providerPrice, // send providerPrice to Peyflex
    });

    // 4. Calculate profit = (ourPrice - providerPrice) * 100 (in kobo)
    const cableProfitKobo = Math.round((dbPlan.ourPrice - dbPlan.providerPrice) * 100);

    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      { status: 'SUCCESS', newBalance: txData.newBalance, profit: cableProfitKobo }
    );

    res.status(200).json({
      status:  'success',
      message: `${identifier.toUpperCase()} ${dbPlan.planName} subscription successful for IUC ${iuc}`,
      data: {
        reference:  txData.reference,
        identifier,
        plan,
        planName:   dbPlan.planName,
        iuc,
        amount:     dbPlan.ourPrice,
        newBalance: txData.newBalance / 100,
      },
    });

  } catch (error) {
    console.error('subscribeCable error:', error.message);
    if (txData) await reverseAndFail({ transaction: txData.transaction, previousBalance: txData.previousBalance, Wallet, Transaction, reason: error.message });
    res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Purchase — Electricity (NEW)
// ---------------------------------------------------------------------------

/**
 * @desc    Purchase electricity units
 * @route   POST /api/v1/vtu/electricity/buy
 * @access  Private
 * @body    { plan, meter, amount, phone, type }
 *
 * NOTE: Electricity is amount-based (user enters amount).
 *       We look up the plan from DB to validate min/max,
 *       but the amount is user-specified.
 *       Admin markup for electricity should be done as a % surcharge
 *       stored in ServicePlan.metadata.surchargePercent.
 */
exports.buyElectricity = async (req, res) => {
  const { plan, meter, amount, phone, type = 'prepaid' } = req.body;
  const { Transaction, Wallet, ServicePlan } = req.models;
  const userId = req.user.id;

  if (!plan || !meter || !amount || !phone) {
    return res.status(400).json({
      status:  'fail',
      message: 'plan, meter, amount and phone are required.',
    });
  }

  let txData = null;

  try {
    // 1. Look up plan from DB — validate amount range
    const dbPlan = await lookupPlan(ServicePlan, {
      service:  'electricity',
      provider: 'electricity',
      planCode: plan,
    });

    const minAmount = dbPlan.metadata?.min_amount || 100;
    const maxAmount = dbPlan.metadata?.max_amount || 1000000;

    if (Number(amount) < minAmount) {
      return res.status(400).json({
        status:  'fail',
        message: `Minimum amount for ${dbPlan.planName} is ₦${minAmount}.`,
      });
    }

    if (Number(amount) > maxAmount) {
      return res.status(400).json({
        status:  'fail',
        message: `Maximum amount for ${dbPlan.planName} is ₦${maxAmount.toLocaleString()}.`,
      });
    }

    // 2. Apply surcharge if set by admin (e.g. 2% = 0.02)
    const surcharge = dbPlan.metadata?.surchargePercent || 0;
    const chargeAmount = Math.ceil(Number(amount) * (1 + surcharge / 100));

    // 3. Debit user at chargeAmount (includes markup)
    txData = await debitWalletAndCreateTx({
      userId,
      amountNaira: chargeAmount,
      type:        'ELECTRICITY',
      details:     {
        beneficiary: meter,
        network:     plan,
        planId:      plan,
        planName:    dbPlan.planName,
        meterType:   type,
      },
      Wallet,
      Transaction,
    });

    // 4. Call Peyflex at original amount (not marked up)
    const providerResponse = await vtuService.purchaseElectricity({
      meter,
      plan,
      amount: Number(amount), // Peyflex gets original amount
      phone,
      type,
    });

    // 5. Calculate profit = surcharge amount in kobo
    const electricityProfitKobo = Math.round((chargeAmount - Number(amount)) * 100);

    // 6. Mark SUCCESS — store token from provider
    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      {
        status:      'SUCCESS',
        providerRef: providerResponse.reference || '',
        newBalance:  txData.newBalance,
        profit:      electricityProfitKobo,
        details: {
          beneficiary: meter,
          network:     plan,
          planName:    dbPlan.planName,
          meterType:   type,
          token:       providerResponse.token,
        },
      }
    );

    res.status(200).json({
      status:  'success',
      message: `Electricity purchase successful for meter ${meter}`,
      data: {
        reference:  txData.reference,
        plan,
        planName:   dbPlan.planName,
        meter,
        amount:     chargeAmount,
        token:      providerResponse.token,
        newBalance: txData.newBalance / 100,
        providerRef: providerResponse.reference,
      },
    });

  } catch (error) {
    console.error('buyElectricity error:', error.message);
    if (txData) await reverseAndFail({ transaction: txData.transaction, previousBalance: txData.previousBalance, Wallet, Transaction, reason: error.message });
    res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
  }
};