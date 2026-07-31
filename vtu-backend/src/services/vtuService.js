'use strict';

// src/services/vtuService.js
// BACKWARD-COMPATIBILITY WRAPPER
// Delegates all calls to the providerRegistry, defaulting to peyflex.
// This ensures existing code that imports vtuService continues to work.

const providerRegistry = require('./providerRegistry');

// Try to load the Peyflex provider directly as fallback
let peyflexProvider;
try {
  peyflexProvider = require('../providers/peyflexProvider');
} catch (e) {
  console.warn('[vtuService] Could not load peyflexProvider directly:', e.message);
}

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------

async function getAirtimeNetworks() {
  try {
    const provider = await providerRegistry.getProvider('airtime');
    return provider.getAirtimeNetworks();
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.getAirtimeNetworks();
    throw e;
  }
}

async function purchaseAirtime({ network, amount, mobile_number }) {
  try {
    const provider = await providerRegistry.getProvider('airtime');
    return provider.purchaseAirtime({ network, amount, mobile_number });
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.purchaseAirtime({ network, amount, mobile_number });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getDataNetworks() {
  try {
    const provider = await providerRegistry.getProvider('data');
    return provider.getDataNetworks();
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.getDataNetworks();
    throw e;
  }
}

async function getDataPlans(network) {
  try {
    const provider = await providerRegistry.getProvider('data');
    return provider.getDataPlans(network);
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.getDataPlans(network);
    throw e;
  }
}

async function purchaseData({ network, plan_code, mobile_number }) {
  try {
    const provider = await providerRegistry.getProvider('data');
    return provider.purchaseData({ network, plan_code, mobile_number });
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.purchaseData({ network, plan_code, mobile_number });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

async function getCableProviders() {
  try {
    const provider = await providerRegistry.getProvider('cable');
    return provider.getCableProviders();
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.getCableProviders();
    throw e;
  }
}

async function getCablePlans(identifier) {
  try {
    const provider = await providerRegistry.getProvider('cable');
    return provider.getCablePlans(identifier);
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.getCablePlans(identifier);
    throw e;
  }
}

async function verifyCableIUC({ iuc, identifier }) {
  try {
    const provider = await providerRegistry.getProvider('cable');
    return provider.verifyCableIUC({ iuc, identifier });
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.verifyCableIUC({ iuc, identifier });
    throw e;
  }
}

async function subscribeCable({ identifier, plan, iuc, phone, amount }) {
  try {
    const provider = await providerRegistry.getProvider('cable');
    return provider.subscribeCable({ identifier, plan, iuc, phone, amount });
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.subscribeCable({ identifier, plan, iuc, phone, amount });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

async function getElectricityPlans() {
  try {
    const provider = await providerRegistry.getProvider('electricity');
    return provider.getElectricityPlans();
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.getElectricityPlans();
    throw e;
  }
}

async function verifyMeter({ meter, plan, type }) {
  try {
    const provider = await providerRegistry.getProvider('electricity');
    return provider.verifyMeter({ meter, plan, type });
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.verifyMeter({ meter, plan, type });
    throw e;
  }
}

async function purchaseElectricity({ meter, plan, amount, phone, type }) {
  try {
    const provider = await providerRegistry.getProvider('electricity');
    return provider.purchaseElectricity({ meter, plan, amount, phone, type });
  } catch (e) {
    if (peyflexProvider) return peyflexProvider.purchaseElectricity({ meter, plan, amount, phone, type });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Exports — same interface as before
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