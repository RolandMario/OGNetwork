'use strict';

// src/providers/datastationProvider.js
// VTU provider implementation for DataStation API (datastationapi.com)
//
// Auth: Authorization: Token {API_KEY}
// Base URL: https://datastationapi.com/api

const axios = require('axios');
const { createApiClient, getNetworkCode, successResponse, extractErrorMessage, isSuccessResponse } = require('./baseProvider');

const API_KEY = process.env.DATASTATION_API_KEY;
const BASE_URL = process.env.DATASTATION_BASE_URL;

if (!API_KEY) {
  console.warn('[datastationProvider] DATASTATION_API_KEY is not set. Check .env');
}

const apiClient = createApiClient(BASE_URL, API_KEY, 'Token');

// DataStation expects numeric network IDs (primary keys), not string names.
// MTN=1, GLO=2, 9MOBILE=3, AIRTEL=4
const NETWORK_MAP = {
  mtn: 1,
  airtel: 4,
  glo: 2,
  '9mobile': 3,
};

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------

async function getAirtimeNetworks() {
  try {
    // DataStation's /user/ response groups networks as MTN_PLAN, GLO_PLAN, etc.
    // Normalize to the standard { networks: [{ id, name }] } shape used by the frontend.
    const data = await _fetchUser();
    const dataplans = data?.Dataplans || {};

    const networks = Object.keys(dataplans)
      .filter((key) => DATASTATION_NETWORK_MAP[key])
      .map((key) => ({
        id:   DATASTATION_NETWORK_MAP[key],
        name: DATASTATION_NETWORK_MAP[key].toUpperCase(),
      }));

    return { networks };
  } catch (error) {
    _clearUserCache();
    throw new Error(`[datastation] getAirtimeNetworks: ${extractErrorMessage(error)}`);
  }
}

async function purchaseAirtime({ network, amount, mobile_number }) {
  if (!network || !amount || !mobile_number) {
    throw new Error('[datastation] purchaseAirtime: network, amount and mobile_number are required.');
  }

  try {
    const response = await apiClient.post('/topup/', {
      network: getNetworkCode(network, NETWORK_MAP),
      amount: Number(amount),
      mobile_number,
      airtime_type: 'VTU',
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
    throw new Error(`[datastation] purchaseAirtime: ${extractErrorMessage(error, 'Airtime purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// Cache full user response so we don't fetch it twice (once for networks,
// once for plans). Cleared after each top-level call (getDataNetworks clears it).
let _userCache = null;

async function _fetchUser() {
  if (_userCache) return _userCache;
  const response = await apiClient.get('/user/');
  _userCache = response.data;
  return _userCache;
}

function _clearUserCache() {
  _userCache = null;
}

// Map from DataStation Dataplans keys to our internal lowercase identifiers
const DATASTATION_NETWORK_MAP = {
  MTN_PLAN: 'mtn',
  GLO_PLAN: 'glo',
  AIRTEL_PLAN: 'airtel',
  '9MOBILE_PLAN': '9mobile',
};

// Reverse map: internal name -> Dataplans key
const INTERNAL_TO_DATASTATION_KEY = {
  mtn: 'MTN_PLAN',
  glo: 'GLO_PLAN',
  airtel: 'AIRTEL_PLAN',
  '9mobile': '9MOBILE_PLAN',
};

async function getDataNetworks() {
  try {
    _clearUserCache();
    const data = await _fetchUser();
    const dataplans = data?.Dataplans || {};
    const networkList = Object.keys(dataplans)
      .filter((key) => DATASTATION_NETWORK_MAP[key])
      .map((key) => ({
        identifier: DATASTATION_NETWORK_MAP[key],
      }));
    return { networks: networkList };
  } catch (error) {
    _clearUserCache();
    throw new Error(`[datastation] getDataNetworks: ${extractErrorMessage(error)}`);
  }
}

async function getDataPlans(network) {
  if (!network) throw new Error('[datastation] getDataPlans: network is required.');
  try {
    const data = await _fetchUser();
    const dataplans = data?.Dataplans || {};
    const datastationKey = INTERNAL_TO_DATASTATION_KEY[network.toLowerCase()];
    if (!datastationKey) {
      return { plans: [] };
    }
    const networkPlans = dataplans[datastationKey] || {};
    // DataStation groups plans by type (ALL, GIFTING, SME2, CORPORATE, etc.)
    // Flatten all plan types into a single array, deduplicating by dataplan_id
    const seen = new Set();
    const plans = [];
    for (const planType of Object.keys(networkPlans)) {
      const items = networkPlans[planType] || [];
      for (const item of items) {
        const id = String(item.dataplan_id || item.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        plans.push({
          plan_code: id,
          label: item.plan || item.dataplan_id,
          description: [item.plan_type, item.month_validate].filter(Boolean).join(' - '),
          amount: item.plan_amount ?? 0,
        });
      }
    }
    return { plans };
  } catch (error) {
    throw new Error(`[datastation] getDataPlans: ${extractErrorMessage(error)}`);
  }
}

async function getDataPlansRaw(network) {
  return getDataPlans(network);
}

async function purchaseData({ network, plan_code, mobile_number }) {
  if (!network || !plan_code || !mobile_number) {
    throw new Error('[datastation] purchaseData: network, plan_code and mobile_number are required.');
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
    throw new Error(`[datastation] purchaseData: ${extractErrorMessage(error, 'Data purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

// Map from our internal cable provider identifiers to DataStation's plan keys
const CABLE_PROVIDER_MAP = {
  gotv: 'GOTVPLAN',
  dstv: 'DSTVPLAN',
  startime: 'STARTIMEPLAN',
};

// Reverse: from DataStation cable name to our internal identifier
const CABLE_NAME_TO_ID = {
  gotv: 'gotv',
  dstv: 'dstv',
  startime: 'startime',
};

async function getCableProviders() {
  try {
    const data = await _fetchUser();
    const cableNames = data?.Cableplan?.cablename || [];
    const providers = cableNames
      .map((entry) => {
        const name = (entry.name || '').toLowerCase();
        const id = CABLE_NAME_TO_ID[name];
        if (!id) return null;
        return { identifier: id, name: entry.name };
      })
      .filter(Boolean);
    return { providers };
  } catch (error) {
    throw new Error(`[datastation] getCableProviders: ${extractErrorMessage(error)}`);
  }
}

async function getCablePlans(identifier) {
  if (!identifier) throw new Error('[datastation] getCablePlans: identifier is required.');
  try {
    const id = identifier.toLowerCase();
    const planKey = CABLE_PROVIDER_MAP[id];
    if (!planKey) return { plans: [] };

    const data = await _fetchUser();
    const cablePlans = data?.Cableplan?.[planKey] || [];
    const plans = cablePlans.map((item) => ({
      plan_code: String(item.cableplan_id || item.id || ''),
      display: item.package || item.cableplan_id,
      description: item.package || '',
      amount: Number(item.plan_amount || 0),
    }));
    return { plans };
  } catch (error) {
    throw new Error(`[datastation] getCablePlans: ${extractErrorMessage(error)}`);
  }
}

async function getCablePlansRaw(identifier) {
  return getCablePlans(identifier);
}

async function verifyCableIUC({ iuc, identifier }) {
  if (!iuc || !identifier) {
    throw new Error('[datastation] verifyCableIUC: iuc and identifier are required.');
  }

  try {
    const response = await apiClient.get('/validateiuc/', {
      params: { cable_id: identifier, smart_card_number: iuc },
    });
    return response.data;
  } catch (error) {
    throw new Error(`[datastation] verifyCableIUC: ${extractErrorMessage(error, 'IUC verification failed')}`);
  }
}

async function subscribeCable({ identifier, plan, iuc, phone, amount }) {
  if (!identifier || !plan || !iuc || !phone) {
    throw new Error('[datastation] subscribeCable: identifier, plan, iuc and phone are required.');
  }

  try {
    const response = await apiClient.post('/cable/', {
      cablename: identifier,
      cableplan: plan,
      smart_card_number: iuc,
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
    throw new Error(`[datastation] subscribeCable: ${extractErrorMessage(error, 'Cable subscription failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

// Map from DataStation electricity disco names to our internal lowercase identifiers
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
};

/**
 * Build electricity plans from the provider's /disco/ endpoint.
 * Each DISCO is returned as { id (numeric disco_id), name } and normalized to
 * { plans: [...] } with the numeric disco_id as plan_code.
 */
async function getElectricityPlans() {
  try {
    // Build the DISCO list from the provider's /disco/ endpoint, which returns
    // each DISCO as { id (numeric disco_id), name }.
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
    throw new Error(`[datastation] getElectricityPlans: ${extractErrorMessage(error)}`);
  }
}

async function getElectricityPlansRaw() {
  return getElectricityPlans();
}

// ---------------------------------------------------------------------------
// Electricity DISCO id resolution
// ---------------------------------------------------------------------------
// The provider exposes the DISCO list (numeric disco_id + name) at GET /disco/.
// The app may send a disco as a numeric id, a slug ('ikeja-electric'), or a
// name ('Ikeja Electric'). Resolve it to the numeric disco_id required by the
// provider's /validatemeter/ and /billpayment/ endpoints.
let _discoCache = null;

async function _fetchDiscoList() {
  if (_discoCache) return _discoCache;
  const response = await apiClient.get('/disco/');
  const list = response?.data?.disko || response?.data?.disco || response?.data?.list || [];
  _discoCache = Array.isArray(list) ? list : [];
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
    throw new Error(`[datastation] Invalid disco pk value: ${value}`);
  }
  // Already numeric (the provider's disco_id)
  if (String(value).trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  const needle = _normalizeDisco(value);
  const discos = await _fetchDiscoList();
  for (const disco of discos) {
    if (disco && _normalizeDisco(disco?.name) === needle) return Number(disco?.id);
  }
  throw new Error(`[datastation] Invalid disco pk value: ${value}`);
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[datastation] verifyMeter: meter and plan are required.');
  }

  try {
    const response = await apiClient.get('/validatemeter/', {
      params: { disco_id: await _resolveDiscoId(plan), meter_number: meter, meter_type: type },
    });
    const data = response.data;

    // DataStation returns { invalid: true, name: "INVALID METER NUMBER" } for invalid meters
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
    throw new Error(`[datastation] verifyMeter: ${extractErrorMessage(error, 'Meter verification failed')}`);
  }
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount || !phone) {
    throw new Error('[datastation] purchaseElectricity: meter, plan, amount and phone are required.');
  }

  try {
    // DataStation expects the meter type as a descriptive string (e.g. 'prepaid'|'postpaid')
    // Use meter_type for consistency with verifyMeter which uses 'meter_type'.
    const response = await apiClient.post('/billpayment/', {
      disco_name: await _resolveDiscoId(plan),
      amount: Number(amount),
      meter_number: meter,
      meter_type: String(type),
    });

    const data = response.data;

    if (isSuccessResponse(data)) {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || data.token || '',
        message: data.message || 'Electricity purchase successful',
      });
    }

    throw new Error(data.api_response || data.message || data.response || 'Electricity purchase failed');
  } catch (error) {
    throw new Error(`[datastation] purchaseElectricity: ${extractErrorMessage(error, 'Electricity purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Exports — common interface
// ---------------------------------------------------------------------------

module.exports = {
  name: 'datastation',
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