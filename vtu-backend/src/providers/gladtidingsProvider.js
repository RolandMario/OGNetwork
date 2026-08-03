'use strict';

// src/providers/gladtidingsProvider.js
// VTU provider implementation for GladtidingsData (gladtidingsdata.com)
//
// Auth: Authorization: Token {API_KEY}
// Base URL: https://www.gladtidingsdata.com/api

const axios = require('axios');
const { createApiClient, getNetworkCode, successResponse, extractErrorMessage } = require('./baseProvider');

const API_KEY = process.env.GLADTIDINGS_API_KEY;
const BASE_URL = process.env.GLADTIDINGS_BASE_URL;

if (!API_KEY) {
  console.warn('[gladtidingsProvider] GLADTIDINGS_API_KEY is not set. Check .env');
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

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Cable subscription successful',
      });
    }

    throw new Error(data.message || data.response || 'Cable subscription failed');
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
};

/**
 * Parse electricity plans from Gladtidings /services/ response.
 * Gladtidings returns electricity data in various shapes depending on the API version.
 * We defensively search common keys and normalize to { plans: [...] }.
 */
async function getElectricityPlans() {
  try {
    const data = await _fetchServices();

    // Gladtidings typically returns electricity under one of these keys
    const electricityRaw =
      data?.electricity ||
      data?.Electricity ||
      data?.electricity_plans ||
      data?.Electricityplan ||
      data?.disco ||
      data?.Disco ||
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
    throw new Error(`[gladtidings] getElectricityPlans: ${extractErrorMessage(error)}`);
  }
}

async function getElectricityPlansRaw() {
  return getElectricityPlans();
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[gladtidings] verifyMeter: meter and plan are required.');
  }

  try {
    const meterTypeId = type === 'prepaid' ? 1 : 2;
    const response = await apiClient.get('/v2/validatemeter/', {
      params: { disco_id: plan, meter_type: type, meter_number: meter },
    });
    return response.data;
  } catch (error) {
    throw new Error(`[gladtidings] verifyMeter: ${extractErrorMessage(error, 'Meter verification failed')}`);
  }
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount || !phone) {
    throw new Error('[gladtidings] purchaseElectricity: meter, plan, amount and phone are required.');
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