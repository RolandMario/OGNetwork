'use strict';

// src/services/vtuService.js
// BACKWARD-COMPATIBILITY WRAPPER
// Delegates all calls to the providerRegistry.
// This ensures existing code that imports vtuService continues to work.

const providerRegistry = require('./providerRegistry');

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------

async function getAirtimeNetworks() {
  const provider = await providerRegistry.getProvider('airtime');
  return provider.getAirtimeNetworks();
}

async function purchaseAirtime({ network, amount, mobile_number }) {
  const provider = await providerRegistry.getProvider('airtime');
  return provider.purchaseAirtime({ network, amount, mobile_number });
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getDataNetworks() {
  const provider = await providerRegistry.getProvider('data');
  return provider.getDataNetworks();
}

async function getDataPlans(network) {
  const provider = await providerRegistry.getProvider('data');
  return provider.getDataPlans(network);
}

async function purchaseData({ network, plan_code, mobile_number }) {
  const provider = await providerRegistry.getProvider('data');
  return provider.purchaseData({ network, plan_code, mobile_number });
}

// ---------------------------------------------------------------------------
// Cable TV
// ---------------------------------------------------------------------------

async function getCableProviders() {
  const provider = await providerRegistry.getProvider('cable');
  return provider.getCableProviders();
}

async function getCablePlans(identifier) {
  const provider = await providerRegistry.getProvider('cable');
  return provider.getCablePlans(identifier);
}

async function verifyCableIUC({ iuc, identifier }) {
  const provider = await providerRegistry.getProvider('cable');
  return provider.verifyCableIUC({ iuc, identifier });
}

async function subscribeCable({ identifier, plan, iuc, phone, amount }) {
  const provider = await providerRegistry.getProvider('cable');
  return provider.subscribeCable({ identifier, plan, iuc, phone, amount });
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

async function getElectricityPlans() {
  const provider = await providerRegistry.getProvider('electricity');
  return provider.getElectricityPlans();
}

async function verifyMeter({ meter, plan, type }) {
  const provider = await providerRegistry.getProvider('electricity');
  return provider.verifyMeter({ meter, plan, type });
}

async function purchaseElectricity({ meter, plan, amount, phone, type }) {
  const provider = await providerRegistry.getProvider('electricity');
  return provider.purchaseElectricity({ meter, plan, amount, phone, type });
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