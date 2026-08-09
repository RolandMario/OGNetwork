'use strict';

// src/providers/gladtidingsProvider.js
// VTU provider implementation for GladtidingsData (gladtidingsdata.com)
//
// Auth: Authorization: Token {API_KEY}
// Base URL: https://www.gladtidingsdata.com/api

const axios = require('axios');
const { createApiClient, getNetworkCode, successResponse, extractErrorMessage, isSuccessResponse } = require('./baseProvider');

const API_KEY = process.env.GLADTIDINGS_API_KEY;
const BASE_URL = process.env.GLADTIDINGS_BASE_URL;

if (!API_KEY) {
  console.warn('[gladtidingsProvider] GLADTIDINGS_API_KEY is not set. Check .env');
}

const apiClient = createApiClient(BASE_URL, API_KEY, 'Token');

// Gladtidings expects numeric network IDs (primary keys), not string names.
// MTN=1, GLO=2, AIRTEL=3, 9MOBILE=6
const NETWORK_MAP = {
  mtn: 1,
  airtel: 3,
  glo: 2,
  '9mobile': 6,
};

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------

async function getAirtimeNetworks() {
  try {
    // Gladtidings returns services under data_plans with a `name` field per network.
    // Normalize to the standard { networks: [{ id, name }] } shape used by the frontend.
    const data = await _fetchServices();
    const rawNetworks = data?.data_plans || data?.networks || [];

    const networks = rawNetworks
      .map((entry) => ({
        id:   (NETWORK_NAME_MAP[entry.name] || entry.name || '').toLowerCase(),
        name: entry.name || entry.id || '',
      }))
      .filter((n) => n.id && n.name);

    return { networks };
  } catch (error) {
    _clearServicesCache();
    throw new Error(`[gladtidings] getAirtimeNetworks: ${extractErrorMessage(error)}`);
  }
}

async function purchaseAirtime({ network, amount, mobile_number }) {
  if (!network || !amount || !mobile_number) {
    throw new Error('[gladtidings] purchaseAirtime: network, amount and mobile_number are required.');
  }

  try {
    const response = await apiClient.post('/topup/', {
      network: getNetworkCode(network, NETWORK_MAP),
      amount: Number(amount),
      mobile_number,
      Ported_number: true,
    });

    const data = response.data;

    if (isSuccessResponse(data)) {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Airtime sent successfully',
      });
    }

    throw new Error(data.api_response || data.message || data.response || 'Airtime purchase failed');
  } catch (error) {
    throw new Error(`[gladtidings] purchaseAirtime: ${extractErrorMessage(error, 'Airtime purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// Cache full services response so we don't fetch it twice (once for networks,
// once for plans). Cleared after each top-level call (getDataNetworks clears it).
let _servicesCache = null;

async function _fetchServices() {
  if (_servicesCache) return _servicesCache;
  const response = await apiClient.get('/services/');
  _servicesCache = response.data;
  return _servicesCache;
}

function _clearServicesCache() {
  _servicesCache = null;
}

// Map from Gladtidings network names to our internal lowercase identifiers
const NETWORK_NAME_MAP = {
  MTN: 'mtn',
  GLO: 'glo',
  AIRTEL: 'airtel',
  '9MOBILE': '9mobile',
};

async function getDataNetworks() {
  try {
    _clearServicesCache();
    const data = await _fetchServices();
    const networkList = (data?.data_plans || []).map((entry) => ({
      identifier: (NETWORK_NAME_MAP[entry.name] || entry.name).toLowerCase(),
    }));
    return { networks: networkList };
  } catch (error) {
    _clearServicesCache();
    throw new Error(`[gladtidings] getDataNetworks: ${extractErrorMessage(error)}`);
  }
}

async function getDataPlans(network) {
  if (!network) throw new Error('[gladtidings] getDataPlans: network is required.');
  try {
    const data = await _fetchServices();
    const networkEntry = (data?.data_plans || []).find(
      (entry) => (NETWORK_NAME_MAP[entry.name] || entry.name).toLowerCase() === network.toLowerCase()
    );
    if (!networkEntry) {
      return { plans: [] };
    }
    const plans = (networkEntry.items || []).map((item) => ({
      plan_code: String(item.dataplan_id || item.id || ''),
      label: item.plan || item.dataplan_id,
      description: [item.plan_type, item.month_validate].filter(Boolean).join(' - '),
      amount: item.api_price ?? item.plan_amount ?? 0,
    }));
    return { plans };
  } catch (error) {
    throw new Error(`[gladtidings] getDataPlans: ${extractErrorMessage(error)}`);
  }
}

async function getDataPlansRaw(network) {
  return getDataPlans(network);
}

async function purchaseData({ network, plan_code, mobile_number }) {
  if (!network || !plan_code || !mobile_number) {
    throw new Error('[gladtidings] purchaseData: network, plan_code and mobile_number are required.');
  }

  try {
    const response = await apiClient.post('/data/', {
      network: getNetworkCode(network, NETWORK_MAP),
      plan: plan_code,
      mobile_number,
      Ported_number: true,
    });

    const data = response.data;

    if (isSuccessResponse(data)) {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Data purchased successfully',
      });
    }

    throw new Error(data.api_response || data.message || data.response || 'Data purchase failed');
  } catch (error) {
    throw new Error(`[gladtidings] purchaseData: ${extractErrorMessage(error, 'Data purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

async function getCableProviders() {
  try {
    const response = await apiClient.get('/services/');
    return response.data;
  } catch (error) {
    throw new Error(`[gladtidings] getCableProviders: ${extractErrorMessage(error)}`);
  }
}

async function getCablePlans(identifier) {
  if (!identifier) throw new Error('[gladtidings] getCablePlans: identifier is required.');
  try {
    const response = await apiClient.get(`/services/?cable_id=${encodeURIComponent(identifier)}`);
    return response.data;
  } catch (error) {
    throw new Error(`[gladtidings] getCablePlans: ${extractErrorMessage(error)}`);
  }
}

async function getCablePlansRaw(identifier) {
  return getCablePlans(identifier);
}

async function verifyCableIUC({ iuc, identifier }) {
  if (!iuc || !identifier) {
    throw new Error('[gladtidings] verifyCableIUC: iuc and identifier are required.');
  }

  try {
    const response = await apiClient.get('/v2/validateiuc/', {
      params: { cable_id: identifier, smart_card_number: iuc },
    });
    return response.data;
  } catch (error) {
    throw new Error(`[gladtidings] verifyCableIUC: ${extractErrorMessage(error, 'IUC verification failed')}`);
  }
}

async function subscribeCable({ identifier, plan, iuc, phone, amount }) {
  if (!identifier || !plan || !iuc || !phone) {
    throw new Error('[gladtidings] subscribeCable: identifier, plan, iuc and phone are required.');
  }

  try {
    const response = await apiClient.post('/cablesub/', {
      cablename: identifier,
      cableplan: plan,
      smart_card_number: iuc,
      phone,
    });

    const data = response.data;

    if (isSuccessResponse(data)) {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Cable subscription successful',
      });
    }

    throw new Error(data.api_response || data.message || data.response || 'Cable subscription failed');
  } catch (error) {
    throw new Error(`[gladtidings] subscribeCable: ${extractErrorMessage(error, 'Cable subscription failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

// Map from Gladtidings electricity disco names to our internal lowercase identifiers
const ELECTRICITY_NAME_TO_ID = {
  'ikeja electric': 'ikeja-electric',
  'ikeja': 'ikeja-electric',
  'eko electric': 'eko-electric',
  'eko': 'eko-electric',
  'abuja electric': 'abuja-electric',
  'abuja': 'abuja-electric',
  'enugu electric': 'enugu-electric',
  'enugu': 'enugu-electric',
  'port harcourt electric': 'port-harcourt-electric',
  'port harcourt': 'port-harcourt-electric',
  'kano electric': 'kano-electric',
  'kano': 'kano-electric',
  'ibadan electric': 'ibadan-electric',
  'ibadan': 'ibadan-electric',
  'jos electric': 'jos-electric',
  'jos': 'jos-electric',
  'kaduna electric': 'kaduna-electric',
  'kaduna': 'kaduna-electric',
  'yola electric': 'yola-electric',
  'yola': 'yola-electric',
  'benin electric': 'benin-electric',
  'benin': 'benin-electric',
  'aba electric': 'aba-electric',
  'aba': 'aba-electric',
};

// ---------------------------------------------------------------------------
// Gladtidings DISCO list — disco_id ⇄ disco name (from Gladtidings docs)
// ---------------------------------------------------------------------------
// Documented Gladtidings electricity DISCOs. These numeric disco_id values are
// what the /v2/validatemeter/ and /v2/billpayment/ endpoints expect, so this
// list is the authoritative source for plan syncing, meter verification and
// purchase.
//
//   (1) 18 = Ikeja Electric      (7) 24 = Jos Electric
//   (2) 19 = Ibadan Electric     (8) 25 = Abuja Electric
//   (3) 20 = Eko Electric        (9) 26 = Enugu Electric
//   (4) 21 = Port Harcourt      (10) 28 = Yola Electric
//   (5) 22 = Kaduna Electric    (11) 29 = Benin Electric
//   (6) 23 = Kano Electric      (12) 30 = Aba Electric
const DISCO_LIST = [
  { disco_id: 18, name: 'Ikeja Electric' },
  { disco_id: 19, name: 'Ibadan Electric' },
  { disco_id: 20, name: 'Eko Electric' },
  { disco_id: 21, name: 'Port Harcourt Electric' },
  { disco_id: 22, name: 'Kaduna Electric' },
  { disco_id: 23, name: 'Kano Electric' },
  { disco_id: 24, name: 'Jos Electric' },
  { disco_id: 25, name: 'Abuja Electric' },
  { disco_id: 26, name: 'Enugu Electric' },
  { disco_id: 28, name: 'Yola Electric' },
  { disco_id: 29, name: 'Benin Electric' },
  { disco_id: 30, name: 'Aba Electric' },
];

/**
 * Build electricity plans for Gladtidings.
 * The DISCO list comes from _fetchDiscoList(), which uses the documented
 * Gladtidings disco IDs/names (DISCO_LIST, e.g. 18=Ikeja Electric, 30=Aba
 * Electric) and only supplements them with the live /disco/ endpoint.
 * Each DISCO is normalized to { plans: [...] } with the numeric disco_id as plan_code.
 */
async function getElectricityPlans() {
  try {
    // Build the DISCO list from _fetchDiscoList(), which starts from the
    // documented Gladtidings disco IDs/names (DISCO_LIST: 18=Ikeja … 30=Aba)
    // and only supplements them with the live /disco/ endpoint.
    const electricityList = await _fetchDiscoList();

    const plans = [];
    const seen = new Set();

    for (const item of electricityList) {
      // Extract disco name — try multiple field names
      const rawName =
        item?.disco_name ||
        item?.disconame ||
        item?.name ||
        item?.disco ||
        item?.provider_name ||
        item?.plan_name ||
        '';

      const name = String(rawName).trim();
      if (!name) continue;

      // Map to internal identifier
      const normalized = name.toLowerCase();
      const identifier = ELECTRICITY_NAME_TO_ID[normalized] || normalized.replace(/\s+/g, '-');

      // Deduplicate by identifier
      if (seen.has(identifier)) continue;
      seen.add(identifier);

      // Extract plan code — disco_id or plan_id
      const planCode =
        item?.disco_id ||
        item?.plan_id ||
        item?.id ||
        item?.code ||
        identifier;

      // Extract min/max amounts
      const minAmount = Number(item?.min_amount ?? item?.minimum_amount ?? item?.min ?? 100);
      const maxAmount = Number(item?.max_amount ?? item?.maximum_amount ?? item?.max ?? 1000000);

      plans.push({
        plan_code: String(planCode), // numeric disco_id required by the provider API
        provider:  identifier,       // disco slug (e.g. 'ikeja-electric')
        plan_name: name,
        min_amount: minAmount,
        max_amount: maxAmount,
        _raw: item,
      });
    }

    return { plans };
  } catch (error) {
    throw new Error(`[gladtidings] getElectricityPlans: ${extractErrorMessage(error)}`);
  }
}

async function getElectricityPlansRaw() {
  return getElectricityPlans();
}

// ---------------------------------------------------------------------------
// Electricity DISCO id resolution
// ---------------------------------------------------------------------------
// The documented DISCO list (DISCO_LIST above) is authoritative — it matches
// the Gladtidings docs (18=Ikeja … 30=Aba). The live /disco/ endpoint is still
// consulted so any DISCO Gladtidings adds later is merged in, but a documented
// disco_id/name is never overridden. The app may send a disco as a numeric id,
// a slug ('ikeja-electric'), or a name ('Ikeja Electric'); resolve it to the
// numeric disco_id required by the provider's /v2/validatemeter/ and
// /v2/billpayment/ endpoints.
let _discoCache = null;

async function _fetchDiscoList() {
  if (_discoCache) return _discoCache;

  // Start from the documented list so ids/names are correct even if the live
  // endpoint is down or returns a mismatched/empty list.
  const merged = [...DISCO_LIST];
  try {
    const response = await apiClient.get('/disco/');
    const live = response?.data?.disko || response?.data?.disco || response?.data?.list || [];
    if (Array.isArray(live)) {
      for (const item of live) {
        const id = item?.disco_id ?? item?.id ?? item?.plan_id;
        if (id === undefined || id === null) continue;
        const numId = Number(id);
        if (Number.isNaN(numId)) continue;
        // Only add DISCOs that are NOT already in the documented list —
        // the documented disco_id/name always wins over the live endpoint.
        if (merged.some((d) => Number(d.disco_id) === numId)) continue;
        merged.push({
          disco_id: numId,
          name: item?.disco_name || item?.name || item?.disco || item?.disconame || String(numId),
        });
      }
    }
  } catch (err) {
    // Live endpoint unavailable — the documented list is authoritative anyway.
    console.warn(`[gladtidingsProvider] /disco/ fetch failed — using documented DISCO list. ${err.message}`);
  }

  _discoCache = merged;
  return _discoCache;
}

function _clearDiscoCache() {
  _discoCache = null;
}

// Normalize a disco name/slug so 'ikeja-electric', 'Ikeja Electric' and
// 'ikeja electric' all collapse to the same key.
function _normalizeDisco(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/electric\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

async function _resolveDiscoId(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`[gladtidings] Invalid disco pk value: ${value}`);
  }

  const num = Number(value);
  const isNumeric = String(value).trim() !== '' && !Number.isNaN(num);

  if (isNumeric) {
    // Verify this disco_id actually belongs to THIS provider's disco list. If a
    // plan was synced from a DIFFERENT provider, its numeric id won't exist here
    // and the provider's /billpayment/ would throw an opaque 500 — so fail fast
    // with a clear, actionable message instead.
    const discos = await _fetchDiscoList();
    const found = discos.some((d) => {
      const id = d?.id ?? d?.disco_id ?? d?.plan_id;
      return id !== undefined && id !== null && Number(id) === num;
    });
    if (!found) {
      throw new Error(
        `[gladtidings] disco_id ${num} was not found in the active provider's electricity list. ` +
        `Re-sync electricity plans from the active provider (gladtidings) before purchasing.`
      );
    }
    return num;
  }

  const needle = _normalizeDisco(value);
  const discos = await _fetchDiscoList();
  for (const disco of discos) {
    if (disco && _normalizeDisco(disco?.name) === needle) {
      return Number(disco?.id ?? disco?.disco_id ?? disco?.plan_id);
    }
  }
  throw new Error(`[gladtidings] Invalid disco pk value: ${value}`);
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[gladtidings] verifyMeter: meter and plan are required.');
  }

  try {
    const disco_id = await _resolveDiscoId(plan);
    console.log('[gladtidingsProvider] Meter verify request -> GET /v2/validatemeter/', { disco_id, meter_number: meter, meter_type: type, rawPlan: plan });
    const response = await apiClient.get('/v2/validatemeter/', {
      params: { disco_id, meter_type: type, meter_number: meter },
    });
    const data = response.data;
    console.log(`[gladtidingsProvider] Meter verify response (HTTP ${response.status}):`, JSON.stringify(data ?? null));

    // Gladtidings returns { invalid: true, name: "INVALID METER NUMBER" } for invalid meters
    if (data && data.invalid === true) {
      const err = new Error(data.name || 'Invalid meter number.');
      err.statusCode = 400;
      throw err;
    }

    // Normalize response to a consistent shape for our frontend
    return {
      status: 'success',
      customer_name: data.name || data.customer_name || 'Unknown',
      address: data.address || '',
      meter_number: meter,
      message: data.message || 'Meter verification successful',
      _raw: data,
    };
  } catch (error) {
    if (error.statusCode) throw error;
    throw new Error(`[gladtidings] verifyMeter: ${extractErrorMessage(error, 'Meter verification failed')}`);
  }
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount || !phone) {
    throw new Error('[gladtidings] purchaseElectricity: meter, plan, amount and phone are required.');
  }

  try {
    const disco_id = await _resolveDiscoId(plan);
    // Gladtidings' /v2/billpayment/ expects the meter type in camelCase `MeterType`
    // with TITLE-CASED values ('Prepaid'|'Postpaid'). The lowercase `meter_type`
    // field (used by geodnatech/datastation) is ignored here and causes the
    // provider to return an empty HTTP 500.
    const meterType = type === 'postpaid' ? 'Postpaid' : 'Prepaid';
    const payload = { disco_id, amount: Number(amount), meter_number: meter, MeterType: meterType };
    const maskMeter = (m) => (typeof m === 'string' && m.length > 6 ? `${m.slice(0, 3)}****${m.slice(-3)}` : m);

    // DEBUG LOGGING: capture the exact payload + resolved disco_id sent, so a
    // plan-code/disco mismatch between the active provider and a synced plan is
    // visible (e.g. using gladtidings' id against geodnatech-synced plans).
    console.log('[gladtidingsProvider] Electricity purchase request -> POST /v2/billpayment/', {
      ...payload,
      meter_number: maskMeter(meter),
      rawPlan: plan,
    });

    const response = await apiClient.post('/v2/billpayment/', payload);
    const data = response.data;

    // DEBUG LOGGING: always dump the raw provider response so we can see the
    // provider's actual error text even if extractErrorMessage can't parse it.
    console.log(`[gladtidingsProvider] Electricity purchase response (HTTP ${response.status}):`, JSON.stringify(data ?? null));

    if (isSuccessResponse(data)) {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || data.token || '',
        message: data.message || 'Electricity purchase successful',
      });
    }

    const err = new Error(data.api_response || data.message || data.response || 'Electricity purchase failed');
    err.responseData = data; // carry the raw body for downstream diagnosis
    throw err;
  } catch (error) {
    // DEBUG LOGGING: dump the raw provider error (status, body, request) so the
    // exact Gladtidings error message is visible even when extractErrorMessage
    // cannot parse it into a clean string.
    console.error('[gladtidingsProvider] Electricity purchase ERROR', {
      message:      error.message,
      code:         error.code,
      status:       error.response?.status,
      statusText:   error.response?.statusText,
      responseData: error.response?.data ?? error.responseData ?? null,
      request: {
        url:    error.config?.url,
        method: error.config?.method,
        params: error.config?.params,
        data:   error.config?.data,
      },
    });
    throw new Error(`[gladtidings] purchaseElectricity: ${extractErrorMessage(error, 'Electricity purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Exports — common interface
// ---------------------------------------------------------------------------

module.exports = {
  name: 'gladtidings',
  getAirtimeNetworks,
  purchaseAirtime,
  getDataNetworks,
  getDataPlans,
  getDataPlansRaw,
  purchaseData,
  getCableProviders,
  getCablePlans,
  getCablePlansRaw,
  verifyCableIUC,
  subscribeCable,
  getElectricityPlans,
  getElectricityPlansRaw,
  verifyMeter,
  purchaseElectricity,
};