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
    const response = await apiClient.get('/services/');
    return response.data;
  } catch (error) {
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

async function getElectricityPlans() {
  try {
    const response = await apiClient.get('/services/');
    return response.data;
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