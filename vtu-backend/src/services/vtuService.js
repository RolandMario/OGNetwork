'use strict';

// src/services/vtuService.js

const https = require('https');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Core HTTP helper
// ---------------------------------------------------------------------------

function peyflexRequest(method, path, body = null) {
  const apiKey  = process.env.PAYFLEX_PROVIDER_API_KEY;
  const baseUrl = process.env.PAYFLEX_BASE_URL || 'https://client.peyflex.com.ng';

  if (!apiKey) {
    throw new Error('[vtuService] PAYFLEX_PROVIDER_API_KEY is not set. Check vtu-backend/.env.');
  }

  const payload = body ? JSON.stringify(body) : null;
  const parsed  = new URL(path, baseUrl);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      port:     443,
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        Authorization:  `Token ${apiKey}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
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
          reject(new Error(`[vtuService] Response parse error: ${e.message} — raw: ${data}`));
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
    throw new Error('[vtuService] purchaseAirtime: network, amount and mobile_number are required.');
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

  return response;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getDataNetworks() {
  return peyflexRequest('GET', '/api/data/networks/');
}

async function getDataPlans(network) {
  if (!network) throw new Error('[vtuService] getDataPlans: network identifier is required.');
  return peyflexRequest('GET', `/api/data/plans/?network=${encodeURIComponent(network)}`);
}

async function purchaseData({ network, plan_code, mobile_number }) {
  if (!network || !plan_code || !mobile_number) {
    throw new Error('[vtuService] purchaseData: network, plan_code and mobile_number are required.');
  }

  // FIX: correct endpoint is /api/data/purchase/ not /api/data/topup/
  // NOTE: Peyflex data purchase does NOT require amount in the body —
  //       the plan_code determines the price on their end.
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

  return response;
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

async function getCableProviders() {
  return peyflexRequest('GET', '/api/cable/providers/');
}

async function getCablePlans(identifier) {
  console.log('Identifier...', identifier)
  if (!identifier) throw new Error('[vtuService] getCablePlans: identifier is required.');
  return peyflexRequest('GET', `/api/cable/plans/${encodeURIComponent(identifier)}/`);
}

async function verifyCableIUC({ iuc, identifier }) {
  if (!iuc || !identifier) {
    throw new Error('[vtuService] verifyCableIUC: iuc and identifier are required.');
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
    throw new Error('[vtuService] subscribeCable: identifier, plan, iuc, phone and amount are required.');
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

  return response;
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

async function getElectricityPlans() {
  return peyflexRequest('GET', '/api/electricity/plans/?identifier=electricity');
}

async function verifyMeter({ meter, plan, type = 'prepaid' }) {
  if (!meter || !plan) {
    throw new Error('[vtuService] verifyMeter: meter and plan are required.');
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

  return response;
}

async function purchaseElectricity({ meter, plan, amount, phone, type = 'prepaid' }) {
  if (!meter || !plan || !amount || !phone) {
    throw new Error('[vtuService] purchaseElectricity: meter, plan, amount and phone are required.');
  }

  const response = await peyflexRequest('POST', '/api/electricity/subscribe/', {
    identifier: 'electricity',
    meter,
    plan,
    amount: String(amount), // Peyflex expects string
    type,
    phone,
  });

  // Electricity can return FAILED status but still have a reference
  // For now, we treat anything != SUCCESS as an error
  if (response.status !== 'SUCCESS') {
    const err = new Error(response.message || 'Electricity purchase failed.');
    err.providerResponse = response;
    throw err;
  }

  return response;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getAirtimeNetworks,
  purchaseAirtime,
  getDataNetworks,
  getDataPlans,
  purchaseData,
  getCableProviders,
  getCablePlans,
  verifyCableIUC,
  subscribeCable,
  getElectricityPlans,
  verifyMeter,
  purchaseElectricity,
};