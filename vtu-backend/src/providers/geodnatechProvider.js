'use strict';

// src/providers/geodnatechProvider.js
// VTU provider implementation for Geodnatech (geodnatech.com)
//
// API Docs: https://documenter.getpostman.com/view/24477076/2sBXqQHJLL
// Auth: Authorization: Token {API_KEY}
// Base URL: https://geodnatech.com/api

const axios = require('axios');
const { createApiClient, getNetworkCode, successResponse, extractErrorMessage } = require('./baseProvider');

const API_KEY = process.env.GEODNATECH_API_KEY;
const BASE_URL = process.env.GEODNATECH_BASE_URL || 'https://geodnatech.com/api';

if (!API_KEY) {
  console.warn('[geodnatechProvider] GEODNATECH_API_KEY is not set. Check .env');
}

const apiClient = createApiClient(BASE_URL, API_KEY, 'Token');

const NETWORK_MAP = {
  mtn: 'mtn',
  airtel: 'airtel',
  glo: 'glo',
  '9mobile': '9mobile',
};

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------

async function getAirtimeNetworks() {
  try {
    // Geodnatech's /user/ response groups networks as MTN_PLAN, GLO_PLAN, etc.
    // Normalize to the standard { networks: [{ id, name }] } shape used by the frontend.
    const data = await _fetchUser();
    const dataplans = data?.Dataplans || {};

    const networks = Object.keys(dataplans)
      .filter((key) => GEODNATECH_NETWORK_MAP[key])
      .map((key) => ({
        id:   GEODNATECH_NETWORK_MAP[key],
        name: GEODNATECH_NETWORK_MAP[key].toUpperCase(),
      }));

    return { networks };
  } catch (error) {
    _clearUserCache();
    throw new Error(`[geodnatech] getAirtimeNetworks: ${extractErrorMessage(error)}`);
  }
}

async function purchaseAirtime({ network, amount, mobile_number }) {
  if (!network || !amount || !mobile_number) {
    throw new Error('[geodnatech] purchaseAirtime: network, amount and mobile_number are required.');
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

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Airtime sent successfully',
      });
    }

    throw new Error(data.message || data.response || 'Airtime purchase failed');
  } catch (error) {
    throw new Error(`[geodnatech] purchaseAirtime: ${extractErrorMessage(error, 'Airtime purchase failed')}`);
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

// Map from Geodnatech Dataplans keys to our internal lowercase identifiers
const GEODNATECH_NETWORK_MAP = {
  MTN_PLAN: 'mtn',
  GLO_PLAN: 'glo',
  AIRTEL_PLAN: 'airtel',
  '9MOBILE_PLAN': '9mobile',
};

// Reverse map: internal name -> Dataplans key
const INTERNAL_TO_GEODNATECH_KEY = {
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
      .filter((key) => GEODNATECH_NETWORK_MAP[key])
      .map((key) => ({
        identifier: GEODNATECH_NETWORK_MAP[key],
      }));
    return { networks: networkList };
  } catch (error) {
    _clearUserCache();
    throw new Error(`[geodnatech] getDataNetworks: ${extractErrorMessage(error)}`);
  }
}

async function getDataPlans(network) {
  if (!network) throw new Error('[geodnatech] getDataPlans: network is required.');
  try {
    const data = await _fetchUser();
    const dataplans = data?.Dataplans || {};
    const geodnatechKey = INTERNAL_TO_GEODNATECH_KEY[network.toLowerCase()];
    if (!geodnatechKey) {
      return { plans: [] };
    }
    const networkPlans = dataplans[geodnatechKey] || {};
    // Geodnatech groups plans by type (ALL, GIFTING, SME2, CORPORATE, etc.)
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
    throw new Error(`[geodnatech] getDataPlans: ${extractErrorMessage(error)}`);
  }
}

async function getDataPlansRaw(network) {
  return getDataPlans(network);
}

async function purchaseData({ network, plan_code, mobile_number }) {
  if (!network || !plan_code || !mobile_number) {
    throw new Error('[geodnatech] purchaseData: network, plan_code and mobile_number are required.');
  }

  try {
    const response = await apiClient.post('/data/', {
      network: getNetworkCode(network, NETWORK_MAP),
      plan: plan_code,
      mobile_number,
      Ported_number: true,
    });

    const data = response.data;

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Data purchased successfully',
      });
    }

    throw new Error(data.message || data.response || 'Data purchase failed');
  } catch (error) {
    throw new Error(`[geodnatech] purchaseData: ${extractErrorMessage(error, 'Data purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

// Map from our internal cable provider identifiers to Geodnatech's plan keys
const CABLE_PROVIDER_MAP = {
  gotv: 'GOTVPLAN',
  dstv: 'DSTVPLAN',
  startime: 'STARTIMEPLAN',
};

// Reverse: from Geodnatech cable name to our internal identifier
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
    throw new Error(`[geodnatech] getCableProviders: ${extractErrorMessage(error)}`);
  }
}

async function getCablePlans(identifier) {
  if (!identifier) throw new Error('[geodnatech] getCablePlans: identifier is required.');
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
    throw new Error(`[geodnatech] getCablePlans: ${extractErrorMessage(error)}`);
  }
}

async function getCablePlansRaw(identifier) {
  return getCablePlans(identifier);
}

async function verifyCableIUC({ iuc, identifier }) {
  if (!iuc || !identifier) {
    throw new Error('[geodnatech] verifyCableIUC: iuc and identifier are required.');
  }

  try {
    const response = await apiClient.get('/ajax/validate_iuc', {
      params: { smart_card_number: iuc, cablename: identifier },
    });
    return response.data;
  } catch (error) {
    throw new Error(`[geodnatech] verifyCableIUC: ${extractErrorMessage(error, 'IUC verification failed')}`);
  }
}

async function subscribeCable({ identifier, plan, iuc, phone, amount }) {
  if (!identifier || !plan || !iuc) {
    throw new Error('[geodnatech] subscribeCable: identifier, plan and iuc are required.');
  }

  try {
    const response = await apiClient.post('/cablesub/', {
      cablename: identifier,
      cableplan: plan,
      smart_card_number: iuc,
    });

    const data = response.data;

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Cable subscription successful',
      });
    }

    throw new Error(data.message || data.response || 'Cable subscription failed');
  } catch (error) {
    throw new Error(`[geodnatech] subscribeCable: ${extractErrorMessage(error, 'Cable subscription failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

// Map from Geodnatech electricity disco names to our internal lowercase identifiers
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
 * Parse electricity plans from Geodnatech /user/ response.
 * Geodnatech returns electricity data in various shapes depending on the API version.
 * We defensively search common keys and normalize to { plans: [...] }.
 */
async function getElectricityPlans() {
  try {
    const data = await _fetchUser();

    // Geodnatech typically returns electricity under one of these keys
    const electricityRaw =
      data?.Electricity ||
      data?.electricity ||
      data?.Electricityplan ||
      data?.electricity_plans ||
      data?.Disco ||
      data?.disco ||
      [];

    // Normalize to an array
    const electricityList = Array.isArray(electricityRaw)
      ? electricityRaw
      : (electricityRaw?.plans || electricityRaw?.list || electricityRaw?.data || []);

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
        plan_code: String(planCode),
        plan_name: name,
        min_amount: minAmount,
        max_amount: maxAmount,
        _raw: item,
      });
    }

    return { plans };
  } catch (error) {
    throw new Error(`[geodnatech] getElectricityPlans: ${extractErrorMessage(error)}`);
  }
}

async function getElectricityPlansRaw() {
  return getElectricityPlans();
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[geodnatech] verifyMeter: meter and plan are required.');
  }

  try {
    const meterType = type === 'prepaid' ? '1' : '2';
    const response = await apiClient.get('/ajax/validate_meter_number', {
      params: { meternumber: meter, disconame: plan, mtype: meterType },
    });
    return response.data;
  } catch (error) {
    throw new Error(`[geodnatech] verifyMeter: ${extractErrorMessage(error, 'Meter verification failed')}`);
  }
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount) {
    throw new Error('[geodnatech] purchaseElectricity: meter, plan and amount are required.');
  }

  try {
    const meterTypeId = type === 'prepaid' ? 1 : 2;
    const response = await apiClient.post('/billpayment/', {
      disco_name: plan,
      amount: Number(amount),
      meter_number: meter,
      MeterType: meterTypeId,
    });

    const data = response.data;

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || data.token || '',
        message: data.message || 'Electricity purchase successful',
      });
    }

    throw new Error(data.message || data.response || 'Electricity purchase failed');
  } catch (error) {
    throw new Error(`[geodnatech] purchaseElectricity: ${extractErrorMessage(error, 'Electricity purchase failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Exports — common interface
// ---------------------------------------------------------------------------

module.exports = {
  name: 'geodnatech',
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