'use strict';

// src/providers/peyflexProvider.js
// VTU provider implementation for Peyflex (client.peyflex.com.ng)

const https = require('https');
const { URL } = require('url');
const { successResponse, extractErrorMessage, extractProviderMessage } = require('./baseProvider');

const API_KEY = process.env.PAYFLEX_PROVIDER_API_KEY;
const BASE_URL = process.env.PAYFLEX_BASE_URL || 'https://client.peyflex.com.ng';

if (!API_KEY) {
  console.warn('[peyflexProvider] PAYFLEX_PROVIDER_API_KEY is not set. Check .env');
}

/**
 * Core HTTP helper — uses native https module (as in original vtuService)
 */
function peyflexRequest(method, path, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const parsed = new URL(path, BASE_URL);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Authorization: `Token ${API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`[peyflexProvider] Response parse error: ${e.message} — raw: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------

async function getAirtimeNetworks() {
  return peyflexRequest('GET', '/api/airtime/networks/');
}

async function purchaseAirtime({ network, amount, mobile_number }) {
  if (!network || !amount || !mobile_number) {
    throw new Error('[peyflexProvider] purchaseAirtime: network, amount and mobile_number are required.');
  }

  const response = await peyflexRequest('POST', '/api/airtime/topup/', {
    network,
    amount,
    mobile_number,
  });

  if (response.status !== 'SUCCESS') {
    const err = new Error(response.message || 'Airtime topup failed.');
    err.providerResponse = response;
    throw err;
  }

  return successResponse({
    providerTxId: response.transaction_id || response.id || '',
    message: response.message || 'Airtime sent successfully',
  });
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getDataNetworks() {
  return peyflexRequest('GET', '/api/data/networks/');
}

async function getDataPlans(network) {
  if (!network) throw new Error('[peyflexProvider] getDataPlans: network identifier is required.');
  return peyflexRequest('GET', `/api/data/plans/?network=${encodeURIComponent(network)}`);
}

async function purchaseData({ network, plan_code, mobile_number }) {
  if (!network || !plan_code || !mobile_number) {
    throw new Error('[peyflexProvider] purchaseData: network, plan_code and mobile_number are required.');
  }

  const response = await peyflexRequest('POST', '/api/data/purchase/', {
    network,
    plan_code,
    mobile_number,
  });

  if (response.status !== 'SUCCESS') {
    const err = new Error(response.message || 'Data purchase failed.');
    err.providerResponse = response;
    throw err;
  }

  return successResponse({
    providerTxId: response.transaction_id || response.id || '',
    message: response.message || 'Data purchased successfully',
  });
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

async function getCableProviders() {
  return peyflexRequest('GET', '/api/cable/providers/');
}

async function getCablePlans(identifier) {
  if (!identifier) throw new Error('[peyflexProvider] getCablePlans: identifier is required.');
  return peyflexRequest('GET', `/api/cable/plans/${encodeURIComponent(identifier)}/`);
}

async function verifyCableIUC({ iuc, identifier }) {
  if (!iuc || !identifier) {
    throw new Error('[peyflexProvider] verifyCableIUC: iuc and identifier are required.');
  }

  const response = await peyflexRequest('POST', '/api/cable/verify/', { iuc, identifier });

  if (response.status !== 'SUCCESS') {
    const err = new Error(response.message || 'IUC verification failed.');
    err.providerResponse = response;
    throw err;
  }

  return response;
}

async function subscribeCable({ identifier, plan, iuc, phone, amount }) {
  if (!identifier || !plan || !iuc || !phone || !amount) {
    throw new Error('[peyflexProvider] subscribeCable: identifier, plan, iuc, phone and amount are required.');
  }

  const response = await peyflexRequest('POST', '/api/cable/subscribe/', {
    identifier,
    plan,
    iuc,
    phone,
    amount: String(amount),
  });

  if (!response.identifier) {
    const err = new Error(response.message || 'Cable subscription failed.');
    err.providerResponse = response;
    throw err;
  }

  return successResponse({
    providerTxId: response.identifier || response.id || '',
    message: response.message || 'Cable subscription successful',
  });
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

async function getElectricityPlans() {
  return peyflexRequest('GET', '/api/electricity/plans/?identifier=electricity');
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[peyflexProvider] verifyMeter: meter and plan are required.');
  }

  const response = await peyflexRequest(
    'GET',
    `/api/electricity/verify/?identifier=electricity&meter=${encodeURIComponent(meter)}&plan=${encodeURIComponent(plan)}&type=${encodeURIComponent(type)}`
  );

  if (response.status !== 'SUCCESS') {
    const err = new Error(response.message || 'Meter verification failed.');
    err.providerResponse = response;
    throw err;
  }

  // Normalize response to a consistent shape for our frontend.
  // Peyflex may return customer_name as "Unknown" when the upstream
  // DISCO cannot resolve the name — we pass it through but the
  // controller will handle the fallback.
  return {
    status: 'success',
    customer_name: response.customer_name || 'Unknown',
    address: response.address || '',
    meter_number: meter,
    message: response.message || 'Meter verification successful',
    _raw: response,
  };
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount || !phone) {
    throw new Error('[peyflexProvider] purchaseElectricity: meter, plan, amount and phone are required.');
  }

  const response = await peyflexRequest('POST', '/api/electricity/subscribe/', {
    identifier: 'electricity',
    meter,
    plan,
    amount: String(amount),
    type,
    phone,
  });

  // DEBUG LOGGING: dump the raw peyflex response so its exact error text is visible.
  console.log('[peyflexProvider] Electricity purchase response:', JSON.stringify(response ?? null));

  if (response.status !== 'SUCCESS') {
    console.error('[peyflexProvider] Electricity purchase FAILED:', JSON.stringify(response ?? null));
    const err = new Error(extractProviderMessage(response, 'Electricity purchase failed.'));
    err.providerResponse = response;
    err.responseData = response; // carry the raw body so the real provider message is surfaced
    throw err;
  }

  return successResponse({
    providerTxId: response.reference || response.id || '',
    message: response.message || 'Electricity purchase successful',
  });
}

// ---------------------------------------------------------------------------
// Lookups / Metadata (used by adminService for syncing)
// ---------------------------------------------------------------------------

async function getElectricityPlansRaw() {
  return peyflexRequest('GET', '/api/electricity/plans/?identifier=electricity');
}

async function getCablePlansRaw(identifier) {
  if (!identifier) throw new Error('[peyflexProvider] getCablePlansRaw: identifier is required.');
  return peyflexRequest('GET', `/api/cable/plans/${encodeURIComponent(identifier)}/`);
}

async function getDataPlansRaw(network) {
  if (!network) throw new Error('[peyflexProvider] getDataPlansRaw: network is required.');
  return peyflexRequest('GET', `/api/data/plans/?network=${encodeURIComponent(network)}`);
}

// ---------------------------------------------------------------------------
// Exports — common interface
// ---------------------------------------------------------------------------

module.exports = {
  name: 'peyflex',
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