'use strict';

// src/controllers/vtuController.js

const vtuService = require('../services/vtuService');
const providerRegistry = require('../services/providerRegistry');
const adminService = require('../services/adminService');
const commissionService = require('../services/commissionService');

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

  // NOTE: `provider` and `planCode` are intentionally omitted when undefined —
  // do not include undefined fields in the filter, otherwise MongoDB matches
  // against the literal undefined/null value and finds nothing
  // (reproducing "Plan not found: electricity/undefined/ikeja-electric").
  const filter = { service, isActive: true };
  if (planCode) filter.planCode = planCode;
  if (provider) filter.provider = provider;

  const plan = await ServicePlan.findOne(filter);

  if (!plan) {
    throw Object.assign(
      new Error(`Plan not found: ${service}${provider ? `/${provider}` : ''}/${planCode}. It may not be synced yet.`),
      { statusCode: 404 }
    );
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Helper — ordered electricity provider candidates (active provider first)
// ---------------------------------------------------------------------------
// The DISCO plans saved in ServicePlan are often synced from a different
// provider than the one currently active (e.g. peyflex slug plans such as
// 'ikeja-electric' stored while gladtidings is the configured provider).
// This returns the configured provider first and then every other provider
// that can verify/purchase electricity, so meter verification and purchase
// stay resilient to plan<->provider mismatches.
async function getElectricityProviderCandidates(AdminConfig) {
  const primary = await providerRegistry.getProvider('electricity', AdminConfig);
  const { PROVIDERS } = providerRegistry;
  const candidates = [primary];
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    if (name === primary.name) continue;
    if (typeof provider.verifyMeter !== 'function' || typeof provider.purchaseElectricity !== 'function') continue;
    if (!candidates.some((c) => c.name === name)) candidates.push(provider);
  }
  return candidates;
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

    const rawPlans = await ServicePlan.find(filter)
      .select('service provider planCode planName description ourPrice prices metadata visibleOnMobile')
      .sort({ provider: 1, ourPrice: 1 })
      .lean();

    let plans = rawPlans;

    // Filter to only the active provider's plans (unless a specific provider was requested)
    if (!provider) {
      try {
        const providerMap = await providerRegistry.getProviderMap(req.models.AdminConfig);
        const activeProvider = providerMap[service];
        // "ALL API" — every synced provider's plans are active, so keep them all.
        if (activeProvider && activeProvider !== providerRegistry.ALL_API_KEY) {
          const activePlans = plans.filter(
            (p) => p.metadata?.syncedFromProvider === activeProvider
          );

          if (activePlans.length > 0) {
            // Prefer the active provider's plans, but never leave an entire
            // network/provider empty: if a provider has NO active-tagged plans,
            // fall back to its (untagged) plans so the screen isn't blank
            // e.g. when the active provider only synced some networks.
            const activeProviders = new Set(activePlans.map((p) => p.provider));
            const fallbackPlans = plans.filter(
              (p) =>
                p.metadata?.syncedFromProvider !== activeProvider &&
                !activeProviders.has(p.provider)
            );
            plans = [...activePlans, ...fallbackPlans];
          }
          // Fallback: if no plans match the active provider tag (e.g., legacy data),
          // keep all plans so the screen isn't empty.
        }
      } catch (err) {
        console.error('[vtuController.getPlans] provider filter error:', err.message);
      }
    }

    // Hide plans the admin switched off on mobile. For data plans this is fully
    // authoritative — only explicitly-enabled plans (visibleOnMobile === true) and
    // their legacy/visible counterparts are shown.
    const visible = plans.filter((p) => adminService.planVisibleOnMobile(p));
    const visibleIds = new Set(visible.map((p) => String(p._id)));

    // A plan the admin explicitly enabled must NEVER be dropped, even if the
    // active-provider filter above excluded it (e.g. an admin enabled a
    // datastation MTN plan while gladtidings is the active data provider).
    const explicitlyEnabled = rawPlans.filter((p) => p.visibleOnMobile === true);
    for (const p of explicitlyEnabled) {
      if (!visibleIds.has(String(p._id))) {
        visible.push(p);
        visibleIds.add(String(p._id));
      }
    }
    plans = visible;

    // Resolve the price this user actually sees & pays, based on their
    // membership level (normal / affiliate / top_user / api_user).
    // Admin configures absolute per-level prices; prices default to 0 in the
    // schema, so when a level's price is invalid/missing we fall back to ourPrice.
    const userLevel = req.user.level || 'normal';
    plans = plans.map((plan) => {
      const levelPrice = plan.prices && plan.prices[userLevel];
      const resolved   = (levelPrice && levelPrice > 0) ? levelPrice : plan.ourPrice;
      // Overwrite ourPrice (what the screens read) with the user's level price
      // and expose it explicitly as `price` too. Keeps every existing display
      // (data/cable) aligned with the amount the backend will actually debit.
      return { ...plan, price: resolved, ourPrice: resolved, userLevel };
    });

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
// Commission config for user-facing clients
// ---------------------------------------------------------------------------
exports.getCommissionConfig = async (req, res) => {
  try {
    const service = req.query.service; // optional: 'data'|'airtime'|'cable'|'electricity'
    const AdminConfig = req.models.AdminConfig;
    const commissionService = require('../services/commissionService');

    const rates = await commissionService.getServiceCommissionRates(AdminConfig);

    if (service) {
      const s = String(service).toLowerCase();
      if (!['airtime', 'data', 'cable', 'electricity'].includes(s)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid service parameter.' });
      }
      return res.status(200).json({ status: 'success', data: { service: s, rate: rates[s] } });
    }

    res.status(200).json({ status: 'success', data: { rates } });
  } catch (error) {
    console.error('[vtuController.getCommissionConfig] error:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to load commission configuration.' });
  }
};

// ---------------------------------------------------------------------------
// Lookup helpers — still needed for providers list and IUC verify
// ---------------------------------------------------------------------------

exports.getAirtimeNetworks = async (req, res) => {
  try {
    const provider = await providerRegistry.getProvider('airtime', req.models.AdminConfig);
    const data = await provider.getAirtimeNetworks();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getDataNetworks = async (req, res) => {
  try {
    const provider = await providerRegistry.getProvider('data', req.models.AdminConfig);
    const data = await provider.getDataNetworks();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getDataPlans = async (req, res) => {
  try {
    const { network } = req.params;
    const provider = await providerRegistry.getProvider('data', req.models.AdminConfig);
    const data = await provider.getDataPlans(network);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getCableProviders = async (req, res) => {
  try {
    const provider = await providerRegistry.getProvider('cable', req.models.AdminConfig);
    const data = await provider.getCableProviders();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getCablePlans = async (req, res) => {
  try {
    const { identifier } = req.params;
    const provider = await providerRegistry.getProvider('cable', req.models.AdminConfig);
    const data = await provider.getCablePlans(identifier);
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
    const provider = await providerRegistry.getProvider('cable', req.models.AdminConfig);
    const data = await provider.verifyCableIUC({ iuc, identifier });
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
      let plans = await ServicePlan.find({ service: 'electricity', isActive: true })
        .select('_id planCode provider planName description ourPrice metadata visibleOnMobile')
        .sort({ planName: 1 })
        .lean();

      // Filter to only the active electricity provider's plans
      try {
        const providerMap = await providerRegistry.getProviderMap(req.models.AdminConfig);
        const activeProvider = providerMap.electricity;
        // "ALL API" — every synced provider's electricity plans are active.
        if (activeProvider && activeProvider !== providerRegistry.ALL_API_KEY) {
          const activePlans = plans.filter(
            (p) => p.metadata?.syncedFromProvider === activeProvider
          );
          // Fallback: if no plans match the active provider tag (e.g., legacy data),
          // keep all plans so the screen isn't empty.
          if (activePlans.length > 0) {
            plans = activePlans;
          }
        }
      } catch (err) {
        console.error('[vtuController.getElectricityPlans] provider filter error:', err.message);
      }

      // Hide plans the admin switched off on mobile
      plans = plans.filter((p) => adminService.planVisibleOnMobile(p));

      if (plans.length) {
        return res.status(200).json({ status: 'success', data: { plans } });
      }
    }

    // Fallback to configured provider if DB empty
    const provider = await providerRegistry.getProvider('electricity', req.models.AdminConfig);
    const data = await provider.getElectricityPlans();
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

    // Try every electricity provider (configured primary first). This keeps
    // meter verification working even when the DISCO plans saved in the DB
    // were synced from a different provider than the currently active one
    // (e.g. peyflex slug plans while gladtidings is the configured provider),
    // which previously surfaced as "Invalid Request Parameters".
    const candidates = await getElectricityProviderCandidates(req.models.AdminConfig);
    const primaryProvider = candidates[0]; // the admin-configured (ACTIVE) provider

    console.log(
      `[vtuController] verifyMeter — ACTIVE electricity provider: "${primaryProvider.name}" | ` +
      `fallback order: ${candidates.map((c) => c.name).join(' -> ')}`
    );

    let lastError = null;
    let primaryError = null; // error from the ACTIVE (admin-configured) provider
    let firstUnknownResult = null; // first non-throwing response (even if name is 'unknown')

    for (const provider of candidates) {
      try {
        const data = await provider.verifyMeter({ meter, plan, type });
        const customerName = data.customer_name || data.name || '';

        // Prefer a provider that actually resolved the customer name.
        if (customerName && customerName.toLowerCase() !== 'unknown') {
          return res.status(200).json({
            status: 'success',
            data: {
              ...data,
              customer_name: customerName,
              address:       data.address || '',
              meter_number:  meter,
              message:       data.message || 'Meter verification successful',
            },
          });
        }

        // Remember the first response in case every provider only returns an
        // 'unknown' customer name.
        if (!firstUnknownResult) firstUnknownResult = data;
      } catch (err) {
        lastError = err;
        if (provider === primaryProvider) primaryError = err;
        console.warn(`[vtuController] verifyMeter via "${provider.name}" failed: ${err.message}`);
      }
    }

    // No provider resolved a real name, but at least one returned a response.
    if (firstUnknownResult) {
      return res.status(200).json({ status: 'success', data: firstUnknownResult });
    }

    // Every provider failed — surface the ACTIVE (admin-configured) provider's
    // error, NOT the last fallback tried, so logs/alerts reflect the admin's
    // selection instead of always mentioning the final provider in the list.
    const primaryOrLast = primaryError || lastError || new Error('Meter verification failed for all providers.');
    primaryOrLast.message = `${primaryOrLast.message} (tried providers: ${candidates.map((c) => c.name).join(', ')})`;
    throw primaryOrLast;
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

    const airtimeProvider = await providerRegistry.getProvider('airtime', req.models.AdminConfig);
    const providerResponse = await airtimeProvider.purchaseAirtime({ network, amount: Number(amount), mobile_number });

    // Calculate airtime profit based on user level percentage
    let airtimeProfitKobo = 0;
    try {
      const AdminConfig = req.models.AdminConfig;
      if (AdminConfig) {
        const profitLevels = await adminService.getAirtimeProfitLevels(AdminConfig);
        const userLevel = req.user.level || 'normal';
        const profitPercent = profitLevels[userLevel] || 0;
        airtimeProfitKobo = Math.round(Number(amount) * 100 * (profitPercent / 100));
      }
    } catch (err) {
      console.error('[vtuController] Error fetching airtime profit config:', err.message);
    }

    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      {
        status: 'SUCCESS',
        providerRef: String(providerResponse.providerTxId || providerResponse.transaction_id || ''),
        newBalance: txData.newBalance,
        profit: airtimeProfitKobo,
      }
    );

    // Credit the user's commission wallet (x% of the amount they were debited)
    await commissionService.creditPurchaseCommission({
      userId,
      amountDebitedKobo: txData.transaction.amount,
      service:           'airtime',
      Wallet,
      Transaction,
      AdminConfig:       req.models.AdminConfig,
      sourceReference:   txData.reference,
    });

    res.status(200).json({
      status:  'success',
      message: `₦${amount} airtime sent to ${mobile_number}`,
      data: {
        reference:     txData.reference,
        network,
        mobile_number,
        amount,
        newBalance:    txData.newBalance / 100,
        providerRef:   providerResponse.providerTxId || providerResponse.transaction_id,
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

    // 2. Determine user's price based on their level
    // NOTE: prices default to 0 in the schema, so we must check for a valid
    //       positive price (> 0) before using it. Otherwise fall back to ourPrice.
    const userLevel = req.user.level || 'normal';
    const levelPrice = plan.prices && plan.prices[userLevel];
    const userPrice = (levelPrice && levelPrice > 0) ? levelPrice : plan.ourPrice;

    txData = await debitWalletAndCreateTx({
      userId,
      amountNaira: userPrice,
      type:        'DATA',
      details:     { beneficiary: mobile_number, network, planId: plan_code, planName: plan.planName, userLevel },
      Wallet,
      Transaction,
    });

    // 3. Call Peyflex — they charge at providerPrice via plan_code
    const dataProvider = await providerRegistry.getProvider('data', req.models.AdminConfig);
    const providerResponse = await dataProvider.purchaseData({ network, plan_code, mobile_number });

    // 4. Calculate profit = (userPrice - providerPrice) * 100 (in kobo)
    const dataProfitKobo = Math.round((userPrice - plan.providerPrice) * 100);

    // 5. Mark SUCCESS with profit
    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      {
        status: 'SUCCESS',
        providerRef: String(providerResponse.providerTxId || providerResponse.transaction_id || ''),
        newBalance: txData.newBalance,
        profit: dataProfitKobo,
      }
    );

    // Credit the user's commission wallet (x% of the amount they were debited)
    await commissionService.creditPurchaseCommission({
      userId,
      amountDebitedKobo: txData.transaction.amount,
      service:           'data',
      Wallet,
      Transaction,
      AdminConfig:       req.models.AdminConfig,
      sourceReference:   txData.reference,
    });

    res.status(200).json({
      status:  'success',
      message: `Data bundle sent to ${mobile_number}`,
      data: {
        reference:     txData.reference,
        network,
        plan_code,
        planName:      plan.planName,
        mobile_number,
        amount:        userPrice,
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

    // 2. Determine user's price based on their level
    // NOTE: prices default to 0 in the schema, so we must check for a valid
    //       positive price (> 0) before using it. Otherwise fall back to ourPrice.
    const userLevel = req.user.level || 'normal';
    const levelPrice = dbPlan.prices && dbPlan.prices[userLevel];
    const userPrice = (levelPrice && levelPrice > 0) ? levelPrice : dbPlan.ourPrice;

    txData = await debitWalletAndCreateTx({
      userId,
      amountNaira: userPrice,
      type:        'CABLE',
      details:     { beneficiary: iuc, network: identifier, planId: plan, planName: dbPlan.planName, userLevel },
      Wallet,
      Transaction,
    });

    // 3. Call Peyflex at providerPrice (amount determined by plan on their end)
    const cableProvider = await providerRegistry.getProvider('cable', req.models.AdminConfig);
    const providerResponse = await cableProvider.subscribeCable({
      identifier,
      plan,
      iuc,
      phone,
      amount: dbPlan.providerPrice, // send providerPrice to provider
    });

    // 4. Calculate profit = (userPrice - providerPrice) * 100 (in kobo)
    const cableProfitKobo = Math.round((userPrice - dbPlan.providerPrice) * 100);

    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      { status: 'SUCCESS', newBalance: txData.newBalance, profit: cableProfitKobo }
    );

    // Credit the user's commission wallet (x% of the amount they were debited)
    await commissionService.creditPurchaseCommission({
      userId,
      amountDebitedKobo: txData.transaction.amount,
      service:           'cable',
      Wallet,
      Transaction,
      AdminConfig:       req.models.AdminConfig,
      sourceReference:   txData.reference,
    });

    res.status(200).json({
      status:  'success',
      message: `${identifier.toUpperCase()} ${dbPlan.planName} subscription successful for IUC ${iuc}`,
      data: {
        reference:  txData.reference,
        identifier,
        plan,
        planName:   dbPlan.planName,
        iuc,
        amount:     userPrice,
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
    // The `plan` sent from the mobile app is now the provider-agnostic DISCO slug
    // (e.g. 'ikeja-electric'), which maps to the DB `provider` field, while
    // `planCode` holds the provider-specific numeric disco_id. Try `planCode`
    // first (legacy/peyflex plans where the slug == planCode), then `provider`.
    let dbPlan = null;
    try {
      dbPlan = await lookupPlan(ServicePlan, {
        service:  'electricity',
        planCode: plan,
      });
    } catch (err) {
      if (err.statusCode === 404) {
        dbPlan = await lookupPlan(ServicePlan, {
          service:  'electricity',
          provider: plan,
        });
      } else {
        throw err;
      }
    }

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

    // 2. Resolve the active electricity provider and its fallbacks ONCE (used by
    //    the pre-flight meter check below and the purchase loop).
    const candidates = await getElectricityProviderCandidates(req.models.AdminConfig);
    const primaryProvider = candidates[0]; // the admin-configured (ACTIVE) provider

    console.log(
      `[vtuController] buyElectricity — ACTIVE electricity provider: "${primaryProvider.name}" | ` +
      `fallback order: ${candidates.map((c) => c.name).join(' -> ')}`
    );

    // 2.5 Pre-flight meter check — BEFORE debiting the user. Some providers
    //     (notably geodnatech) mark a purchase "successful" even for a meter
    //     they cannot verify and return no token, silently charging the user
    //     for nothing. If the ACTIVE provider explicitly reports an invalid
    //     meter (HTTP 400), fail fast. Transient/network errors are logged and
    //     ignored so the candidate loop below can still attempt the purchase.
    try {
      await primaryProvider.verifyMeter({ meter, plan, type });
    } catch (verifyErr) {
      if (verifyErr.statusCode === 400) {
        return res.status(400).json({
          status:  'fail',
          message: `Meter ${meter} could not be verified on the active electricity provider (${primaryProvider.name}). ` +
                   `Please check the meter number or switch the active electricity provider.`,
        });
      }
      console.warn(`[vtuController] buyElectricity pre-flight meter check via "${primaryProvider.name}" warning: ${verifyErr.message}`);
    }

    // 3. Apply surcharge if set by admin (e.g. 2% = 0.02)
    const surcharge = dbPlan.metadata?.surchargePercent || 0;
    const chargeAmount = Math.ceil(Number(amount) * (1 + surcharge / 100));

    // 4. Debit user at chargeAmount (includes markup)
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

    // 5. Purchase electricity — try the configured provider first, then any
    //    other provider that can handle this plan (mirrors meter verification
    //    so a plan synced from one provider still works when another is active).

    let providerResponse = null;
    let providerError = null;
    let primaryError = null; // error from the ACTIVE (admin-configured) provider
    let purchasedViaProvider = null; // name of the provider that actually fulfilled the purchase
    for (const electricityProvider of candidates) {
      try {
        providerResponse = await electricityProvider.purchaseElectricity({
          meter,
          plan,
          amount: Number(amount), // Provider gets original amount
          phone,
          type,
        });
        purchasedViaProvider = electricityProvider.name;
        break; // success — stop trying further providers
      } catch (err) {
        providerError = err;
        if (electricityProvider === primaryProvider) primaryError = err;
        console.warn(`[vtuController] buyElectricity via "${electricityProvider.name}" failed: ${err.message}`);
      }
    }

    if (!providerResponse) {
      // Surface the ACTIVE (admin-configured) provider's error, NOT the last
      // fallback tried, so logs/alerts reflect the admin's selection instead of
      // always mentioning the final provider in the list.
      const primaryOrLast = primaryError || providerError || new Error('Electricity purchase failed for all providers.');
      primaryOrLast.message = `${primaryOrLast.message} (tried providers: ${candidates.map((c) => c.name).join(', ')})`;
      throw primaryOrLast;
    }

    // 5. Calculate profit = surcharge amount in kobo
    const electricityProfitKobo = Math.round((chargeAmount - Number(amount)) * 100);

    // 6. Mark SUCCESS — store token from provider
    await Transaction.findOneAndUpdate(
      { _id: txData.transaction._id },
      {
        status:      'SUCCESS',
        providerRef: providerResponse.providerTxId || providerResponse.reference || '',
        newBalance:  txData.newBalance,
        profit:      electricityProfitKobo,
        details: {
          beneficiary: meter,
          network:     plan,
          planName:    dbPlan.planName,
          meterType:   type,
          token:       providerResponse.token || providerResponse.providerTxId,
          provider:    purchasedViaProvider || primaryProvider.name,
        },
      }
    );

    // Credit the user's commission wallet (x% of the amount they were debited)
    await commissionService.creditPurchaseCommission({
      userId,
      amountDebitedKobo: txData.transaction.amount,
      service:           'electricity',
      Wallet,
      Transaction,
      AdminConfig:       req.models.AdminConfig,
      sourceReference:   txData.reference,
    });

    res.status(200).json({
      status:  'success',
      message: `Electricity purchase successful for meter ${meter}`,
      data: {
        reference:  txData.reference,
        plan,
        planName:   dbPlan.planName,
        meter,
        amount:     chargeAmount,
        token:      providerResponse.token || providerResponse.providerTxId,
        newBalance: txData.newBalance / 100,
        provider:   purchasedViaProvider || primaryProvider.name,
        providerRef: providerResponse.providerTxId || providerResponse.reference,
      },
    });

  } catch (error) {
    console.error('buyElectricity error:', error.message);
    if (txData) await reverseAndFail({ transaction: txData.transaction, previousBalance: txData.previousBalance, Wallet, Transaction, reason: error.message });

    let message = error.message;

    // The purchase sum is debited from the VTU provider's RESELLER account, not
    // the customer's app wallet. If the provider reports a low balance, make that
    // unmistakably clear so the admin funds the right account instead of chasing
    // code bugs (and so the customer knows they were auto-refunded).
    if (/insufficient balance|your current balance/i.test(message)) {
      message = `${message} — the VTU provider's API account is low on funds. ` +
        `Fund the active electricity provider's account and retry (any debited amount was automatically refunded).`;
    }

    res.status(error.statusCode || 500).json({ status: 'error', message });
  }
};