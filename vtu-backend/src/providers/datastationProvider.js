'use strict';

// src/providers/datastationProvider.js
// VTU provider implementation for DataStation API (datastationapi.com)
//
// Auth: Authorization: Token {API_KEY}
// Base URL: https://datastationapi.com/api

const axios = require('axios');
const { createApiClient, getNetworkCode, successResponse, extractErrorMessage } = require('./baseProvider');

const API_KEY = process.env.DATASTATION_API_KEY;
const BASE_URL = process.env.DATASTATION_BASE_URL;

if (!API_KEY) {
  console.warn('[datastationProvider] DATASTATION_API_KEY is not set. Check .env');
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
    const response = await apiClient.get('/user/');
    return response.data;
  } catch (error) {
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

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Airtime sent successfully',
      });
    }

    throw new Error(data.message || data.response || 'Airtime purchase failed');
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

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Data purchased successfully',
      });
    }

    throw new Error(data.message || data.response || 'Data purchase failed');
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

    if (data.status === 'success' || data.status === true || data.status === 'SUCCESS') {
      return successResponse({
        providerTxId: data.transaction_id || data.id || data.reference || '',
        message: data.message || 'Cable subscription successful',
      });
    }

    throw new Error(data.message || data.response || 'Cable subscription failed');
  } catch (error) {
    throw new Error(`[datastation] subscribeCable: ${extractErrorMessage(error, 'Cable subscription failed')}`);
  }
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

async function getElectricityPlans() {
  try {
    const response = await apiClient.get('/user/');
    return response.data;
  } catch (error) {
    throw new Error(`[datastation] getElectricityPlans: ${extractErrorMessage(error)}`);
  }
}

async function getElectricityPlansRaw() {
  return getElectricityPlans();
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[datastation] verifyMeter: meter and plan are required.');
  }

  try {
    const response = await apiClient.get('/validatemeter/', {
      params: { disco_id: plan, meter_number: meter, meter_type: type },
    });
    return response.data;
  } catch (error) {
    throw new Error(`[datastation] verifyMeter: ${extractErrorMessage(error, 'Meter verification failed')}`);
  }
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount || !phone) {
    throw new Error('[datastation] purchaseElectricity: meter, plan, amount and phone are required.');
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