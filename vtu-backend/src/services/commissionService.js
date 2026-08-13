'use strict';

// src/services/commissionService.js
//
// Commission engine:
//  - Admin-configurable commission % per service (airtime, data, cable, electricity),
//    constrained to the 1–10% range described by the product owner (0 disables it).
//  - On every successful purchase, the user earns `x%` of the amount they were
//    debited. That amount is credited to the user's commission wallet
//    (Wallet.commissionBalance) and a COMMISSION transaction is recorded.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SERVICE_KEYS = ['airtime', 'data', 'cable', 'electricity'];

const DEFAULT_RATES = SERVICE_KEYS.reduce((acc, key) => { acc[key] = 0; return acc; }, {});

const CONFIG_KEY = 'serviceCommissionPercent';

/**
 * Get the commission % for every service from AdminConfig.
 * @returns {Promise<Object>} { airtime, data, cable, electricity } percents
 */
async function getServiceCommissionRates(AdminConfig) {
  if (!AdminConfig) return { ...DEFAULT_RATES };

  const config = await AdminConfig.findOne({ key: CONFIG_KEY });
  const value = config ? config.value : {};

  const result = {};
  for (const key of SERVICE_KEYS) {
    result[key] = (value && value[key] !== undefined) ? Number(value[key]) : 0;
  }
  return result;
}

/**
 * Get the commission % for a single service.
 * @returns {Promise<Number>} percent (0 means no commission is paid)
 */
async function getServiceCommissionRate(AdminConfig, service) {
  if (!SERVICE_KEYS.includes(service)) return 0;
  const rates = await getServiceCommissionRates(AdminConfig);
  return Number(rates[service] || 0);
}

/**
 * Persist the admin-configured commission % per service.
 * @param {Object} AdminConfig
 * @param {Object} commissionMap - { airtime: 2, data: 1.5, ... }
 * @returns {Promise<Object>} the merged, saved rates
 */
async function updateServiceCommissionRates(AdminConfig, commissionMap) {
  if (!AdminConfig) throw new Error('AdminConfig model not available.');

  for (const key of Object.keys(commissionMap || {})) {
    if (!SERVICE_KEYS.includes(key)) {
      throw new Error(`Invalid service: ${key}. Valid services: ${SERVICE_KEYS.join(', ')}`);
    }
    const val = Number(commissionMap[key]);
    if (isNaN(val) || val < 0 || val > 10) {
      throw new Error(`Commission for ${key} must be between 1 and 10 percent (0 disables it).`);
    }
  }

  const existing = await getServiceCommissionRates(AdminConfig);
  const merged = { ...existing, ...commissionMap };

  const config = await AdminConfig.findOneAndUpdate(
    { key: CONFIG_KEY },
    {
      key:   CONFIG_KEY,
      value: merged,
      description: 'Commission percentage paid back to users per service',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return config.value;
}

/**
 * Credit a user's commission wallet for a completed purchase.
 *
 * Commission = round(debitedAmountKobo * rate / 100).
 * This runs AFTER a purchase is confirmed SUCCESS so a failed/reversed purchase
 * never generates commission. Failures here are swallowed (non-fatal) so a
 * commission bookkeeping hiccup can never break an already-successful purchase.
 *
 * @param {Object} opts
 * @param {string}  opts.userId
 * @param {number}  opts.amountDebitedKobo - what the user was debited (base unit)
 * @param {string}  opts.service          - 'airtime' | 'data' | 'cable' | 'electricity'
 * @param {Object}  opts.Wallet
 * @param {Object}  opts.Transaction
 * @param {Object}  opts.AdminConfig
 * @param {string}  [opts.sourceReference] - the purchase transaction reference
 * @returns {Promise<number|null>} credited amount in kobo, or null if none credited
 */
async function creditPurchaseCommission({ userId, amountDebitedKobo, service, Wallet, Transaction, AdminConfig, sourceReference }) {
  try {
    if (!Wallet || !Transaction) return null;
    if (!userId || !amountDebitedKobo || amountDebitedKobo <= 0) return null;

    const rate = await getServiceCommissionRate(AdminConfig, service);
    if (!rate || rate <= 0) return null;

    const amountKobo = Math.round(Number(amountDebitedKobo) * (rate / 100));
    if (amountKobo <= 0) return null;

    await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { commissionBalance: amountKobo } }
    );

    const reference = `OGN-COMM-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    await Transaction.create({
      user:                 userId,
      type:                 'COMMISSION',
      amount:               amountKobo,
      status:               'SUCCESS',
      transactionReference: reference,
      details: {
        service,
        sourceReference: sourceReference || '',
        rate,
      },
      note: `Commission (${rate}%) earned on ${service} purchase`,
    });

    console.log(`[commission] Credited ₦${amountKobo / 100} (${rate}%) to user ${userId} for ${service}`);
    return amountKobo;
  } catch (err) {
    console.error(`[commission] Failed to credit commission for user ${userId} (${service}):`, err.message);
    return null;
  }
}

module.exports = {
  SERVICE_KEYS,
  getServiceCommissionRates,
  getServiceCommissionRate,
  updateServiceCommissionRates,
  creditPurchaseCommission,
};
