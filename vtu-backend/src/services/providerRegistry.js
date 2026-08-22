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

// The special "ALL API" provider key: when a service type is configured as
// "ALL API", every VTU API in ALL_API_PROVIDERS becomes eligible/active.
const ALL_API_KEY = 'all';

// The VTU APIs that "ALL API" aggregates (datastation, gladtidings, geodnatech).
const ALL_API_PROVIDERS = ['datastation', 'gladtidings', 'geodnatech'];

// Include the virtual "all" key so admin validation + dropdowns accept it.
const VALID_PROVIDER_NAMES = [...Object.keys(PROVIDERS), ALL_API_KEY];

// ---------------------------------------------------------------------------
// Aggregate provider — used when a service type is configured as "ALL API".
// Merges entity/plan lists across the three providers and provides purchase
// failover (tries each provider in order until one succeeds).
// ---------------------------------------------------------------------------
function createAggregateProvider() {
  const providers = ALL_API_PROVIDERS.map((name) => PROVIDERS[name]).filter(Boolean);

  const mergeUnique = (items, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = keyFn(item);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };

  // Run a list-returning call across all providers and flatten the results.
  const collect = async (method, itemKey) => {
    const settlements = await Promise.allSettled(providers.map((p) => p[method]()));
    const all = [];
    for (const r of settlements) {
      if (r.status === 'fulfilled') all.push(...(r.value?.networks || r.value?.providers || r.value?.plans || []));
    }
    return all;
  };

  // Purchase-style call with per-provider failover.
  const failover = async (method, args) => {
    let lastErr;
    for (const p of providers) {
      try {
        return await p[method](args);
      } catch (e) {
        lastErr = e;
        console.warn(`[providerRegistry][all] ${method} failover from ${p.name}: ${e.message}`);
      }
    }
    throw lastErr || new Error(`All APIs failed for ${method}.`);
  };

  return {
    name: ALL_API_KEY,

    async getBalance() {
      const settlements = await Promise.allSettled(providers.map((p) => p.getBalance()));
      for (const r of settlements) {
        if (r.status === 'fulfilled') return r.value;
      }
      throw new Error(
        settlements.map((r) => r.reason?.message).filter(Boolean).join('; ') || 'All APIs failed to fetch balance.'
      );
    },

    async getAirtimeNetworks() {
      return { networks: mergeUnique(await collect('getAirtimeNetworks'), (n) => n.name || n.identifier || JSON.stringify(n)) };
    },
    async purchaseAirtime(args) {
      return failover('purchaseAirtime', args);
    },

    async getDataNetworks() {
      return { networks: mergeUnique(await collect('getDataNetworks'), (n) => n.name || n.identifier || JSON.stringify(n)) };
    },
    async getDataPlans(network) {
      const settlements = await Promise.allSettled(providers.map((p) => p.getDataPlans(network)));
      const plans = [];
      for (const r of settlements) if (r.status === 'fulfilled') plans.push(...(r.value?.plans || []));
      return { plans: mergeUnique(plans, (pl) => pl.plan_code) };
    },
    async purchaseData(args) {
      return failover('purchaseData', args);
    },

    async getCableProviders() {
      return { providers: mergeUnique(await collect('getCableProviders'), (c) => c.identifier || c.name) };
    },
    async getCablePlans(identifier) {
      const settlements = await Promise.allSettled(providers.map((p) => p.getCablePlans(identifier)));
      const plans = [];
      for (const r of settlements) if (r.status === 'fulfilled') plans.push(...(r.value?.plans || []));
      return { plans: mergeUnique(plans, (pl) => pl.plan_code) };
    },
    async verifyCableIUC(args) {
      return failover('verifyCableIUC', args);
    },
    async subscribeCable(args) {
      return failover('subscribeCable', args);
    },

    async getElectricityPlans() {
      const settlements = await Promise.allSettled(providers.map((p) => p.getElectricityPlans()));
      const plans = [];
      for (const r of settlements) if (r.status === 'fulfilled') plans.push(...(r.value?.plans || []));
      return { plans: mergeUnique(plans, (pl) => pl.plan_code) };
    },
    async verifyMeter(args) {
      return failover('verifyMeter', args);
    },
    async purchaseElectricity(args) {
      return failover('purchaseElectricity', args);
    },
  };
}

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

  // "ALL API" — return the aggregate provider that merges/failovers across the
  // three VTU APIs (datastation, gladtidings, geodnatech).
  if (providerName === ALL_API_KEY) {
    return createAggregateProvider();
  }

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
 * Resolve the list of providers that should be used for a service type.
 * When the configured (or requested) provider is "ALL API", returns every VTU
 * API in ALL_API_PROVIDERS; otherwise returns just the single provider.
 * @param {string} serviceType - 'airtime', 'data', 'cable', or 'electricity'
 * @param {Object} [AdminConfig]
 * @param {string} [providerName] - Optional explicit override (e.g. for sync).
 * @returns {Promise<Object[]>} - Array of provider module instances
 * @throws {Error} if the configured provider is invalid
 */
async function getProvidersForService(serviceType, AdminConfig = null, providerName = null) {
  const map = AdminConfig ? await loadProviderMap(AdminConfig) : (cachedProviderMap || DEFAULT_MAP);
  const configured = providerName || map[serviceType];

  if (configured === ALL_API_KEY) {
    return ALL_API_PROVIDERS.map((name) => PROVIDERS[name]).filter(Boolean);
  }

  const provider = PROVIDERS[configured];
  if (!provider) {
    throw new Error(
      `No provider configured for service type: ${serviceType}. ` +
      `Valid providers: ${VALID_PROVIDER_NAMES.join(', ')}`
    );
  }

  return [provider];
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
// Cable IUC verification (resilient)
// ---------------------------------------------------------------------------

// Preferred order for cable IUC verification once the configured provider(s)
// have been tried. Verification is a read-only lookup, so it is safe to fall
// through to another provider if the configured one is down (e.g. upstream
// HTTP 500 / 404 on its /validateiuc-style endpoint).
const CABLE_VERIFY_PREFERENCE = ['peyflex', 'datastation', 'gladtidings', 'geodnatech'];

/**
 * Verify a cable IUC with provider failover.
 * Tries the configured cable provider(s) first (a single provider, or the
 * "ALL API" aggregate). If they all fail, falls back through every other
 * cable-capable provider in CABLE_VERIFY_PREFERENCE.
 *
 * Verification is read-only, so this never risks a double charge — unlike
 * purchases (subscribeCable), which are intentionally NOT failed over.
 *
 * @param {Object} args - { iuc, identifier }
 * @param {Object} [AdminConfig] - The AdminConfig model (from req.models)
 * @returns {Promise<{ provider: string, result: Object }>}
 * @throws {Error} if every provider fails (includes the last real error)
 */
async function verifyCableIUCWithFallback({ iuc, identifier }, AdminConfig = null) {
  // 1) Resolve the configured provider(s) for cable.
  let attempts = [];
  try {
    attempts = (await getProvidersForService('cable', AdminConfig)).filter(
      (p) => typeof p.verifyCableIUC === 'function'
    );
  } catch (err) {
    console.warn('[providerRegistry] Could not resolve configured cable provider(s):', err.message);
    attempts = [];
  }

  // 2) Add every other cable-capable provider as a fallback. When the
  //    "ALL API" aggregate is configured it already tried datastation,
  //    gladtidings and geodnatech internally, so skip those members.
  const hasAggregate = attempts.some((p) => p.name === ALL_API_KEY);
  for (const name of CABLE_VERIFY_PREFERENCE) {
    if (hasAggregate && ALL_API_PROVIDERS.includes(name)) continue; // aggregate already tried it
    const provider = PROVIDERS[name];
    if (!provider || attempts.some((p) => p.name === provider.name)) continue;
    if (typeof provider.verifyCableIUC !== 'function') continue;
    attempts.push(provider);
  }

  if (!attempts.length) {
    throw new Error('No cable provider available to verify IUC.');
  }

  // 3) Try each provider in order; surface the real last error if all fail.
  let lastErr = null;
  for (const provider of attempts) {
    try {
      const result = await provider.verifyCableIUC({ iuc, identifier });
      return { provider: provider.name || 'unknown', result };
    } catch (err) {
      lastErr = err;
      console.warn(
        `[providerRegistry] IUC verify via "${provider.name || 'unknown'}" failed: ${err.message}`
      );
    }
  }

  throw new Error(
    `IUC verification failed for all ${attempts.length} provider(s). ` +
    `Last error: ${lastErr?.message || 'unknown error'}`
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getProvider,
  getProvidersForService,
  getProviderMap,
  setProviderMap,
  resetProviderMap,
  getAvailableProviders,
  loadProviderMap,
  verifyCableIUCWithFallback,
  VALID_PROVIDER_NAMES,
  ALL_API_KEY,
  ALL_API_PROVIDERS,
  DEFAULT_MAP,
  PROVIDERS,
};