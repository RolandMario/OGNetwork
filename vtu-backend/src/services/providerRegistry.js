'use strict';

// src/services/providerRegistry.js
// Central registry that routes VTU service requests to the correct provider
// based on admin configuration stored in AdminConfig collection.
//
// AdminConfig stores: { key: "serviceProviderMap", value: { airtime: "peyflex", data: "gladtidings", ... } }

const PROVIDERS = {
  peyflex: require('../providers/peyflexProvider'),
  gladtidings: require('../providers/gladtidingsProvider'),
  datastation: require('../providers/datastationProvider'),
  geodnatech: require('../providers/geodnatechProvider'),
};

const VALID_PROVIDER_NAMES = Object.keys(PROVIDERS);

// Default mapping — used when AdminConfig hasn't been set yet
const DEFAULT_MAP = {
  airtime: 'peyflex',
  data: 'peyflex',
  cable: 'peyflex',
  electricity: 'peyflex',
};

// In-memory cache of the provider map (refreshed on each getProvider call)
let cachedProviderMap = null;

/**
 * Load the provider mapping from AdminConfig.
 * Falls back to DEFAULT_MAP if not configured.
 * @param {Object} [AdminConfig] - The AdminConfig model (from req.models)
 * @returns {Promise<Object>} e.g. { airtime: "peyflex", data: "gladtidings", ... }
 */
async function loadProviderMap(AdminConfig) {
  try {
    if (AdminConfig) {
      const config = await AdminConfig.findOne({ key: 'serviceProviderMap' });
      if (config && config.value && typeof config.value === 'object') {
        const map = { ...DEFAULT_MAP, ...config.value };
        cachedProviderMap = map;
        return map;
      }
    }
  } catch (err) {
    console.error('[providerRegistry] Error loading provider map:', err.message);
  }

  // Fallback to default
  cachedProviderMap = { ...DEFAULT_MAP };
  return cachedProviderMap;
}

/**
 * Get the provider instance for a given service type.
 * @param {string} serviceType - 'airtime', 'data', 'cable', or 'electricity'
 * @param {Object} [AdminConfig] - The AdminConfig model. If not provided, uses cached/default map.
 * @returns {Promise<Object>} - The provider module instance
 * @throws {Error} if provider not found
 */
async function getProvider(serviceType, AdminConfig = null) {
  const map = AdminConfig ? await loadProviderMap(AdminConfig) : (cachedProviderMap || DEFAULT_MAP);

  const providerName = map[serviceType];
  if (!providerName) {
    throw new Error(`No provider configured for service type: ${serviceType}`);
  }

  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(
      `Unknown provider "${providerName}" configured for "${serviceType}". ` +
      `Valid providers: ${VALID_PROVIDER_NAMES.join(', ')}`
    );
  }

  return provider;
}

/**
 * Get the current provider map (for admin dashboard display).
 * @param {Object} [AdminConfig]
 * @returns {Promise<Object>}
 */
async function getProviderMap(AdminConfig = null) {
  return AdminConfig ? await loadProviderMap(AdminConfig) : (cachedProviderMap || { ...DEFAULT_MAP });
}

/**
 * Update the provider mapping in AdminConfig.
 * @param {Object} AdminConfig - The AdminConfig model
 * @param {Object} newMap - e.g. { airtime: "gladtidings", data: "peyflex", ... }
 * @returns {Promise<Object>} - The saved map
 * @throws {Error} if validation fails
 */
async function setProviderMap(AdminConfig, newMap) {
  if (!AdminConfig) {
    throw new Error('AdminConfig model is required to save provider configuration.');
  }

  // Validate: ensure only known service types with valid provider names
  const validServices = ['airtime', 'data', 'cable', 'electricity'];
  const sanitizedMap = {};

  for (const service of validServices) {
    const providerName = newMap[service];
    if (providerName) {
      if (!VALID_PROVIDER_NAMES.includes(providerName)) {
        throw new Error(
          `Invalid provider "${providerName}" for "${service}". ` +
          `Valid providers: ${VALID_PROVIDER_NAMES.join(', ')}`
        );
      }
      sanitizedMap[service] = providerName;
    } else {
      // Use previous configured value or default
      sanitizedMap[service] = DEFAULT_MAP[service];
    }
  }

  const config = await AdminConfig.findOneAndUpdate(
    { key: 'serviceProviderMap' },
    {
      key: 'serviceProviderMap',
      value: sanitizedMap,
      description: 'Maps each service type (airtime, data, cable, electricity) to a VTU provider',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Update cache
  cachedProviderMap = sanitizedMap;

  return sanitizedMap;
}

/**
 * Reset the provider map to defaults.
 * @param {Object} AdminConfig
 * @returns {Promise<Object>}
 */
async function resetProviderMap(AdminConfig) {
  cachedProviderMap = { ...DEFAULT_MAP };

  if (AdminConfig) {
    await AdminConfig.findOneAndDelete({ key: 'serviceProviderMap' });
  }

  return { ...DEFAULT_MAP };
}

/**
 * Get list of available providers.
 * @returns {string[]}
 */
function getAvailableProviders() {
  return [...VALID_PROVIDER_NAMES];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getProvider,
  getProviderMap,
  setProviderMap,
  resetProviderMap,
  getAvailableProviders,
  loadProviderMap,
  VALID_PROVIDER_NAMES,
  DEFAULT_MAP,
  PROVIDERS,
};