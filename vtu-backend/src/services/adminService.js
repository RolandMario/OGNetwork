'use strict';

// src/services/adminService.js

const vtuService = require('./vtuService');
const providerRegistry = require('./providerRegistry');

// User level constants
const USER_LEVELS = ['normal', 'affiliate', 'top_user', 'api_user'];

/**
 * Initialize level prices from a base price.
 * Sets all levels to the same price initially.
 */
function initLevelPrices(basePrice) {
  const prices = {};
  for (const level of USER_LEVELS) {
    prices[level] = Number(basePrice);
  }
  return prices;
}

// ---------------------------------------------------------------------------
// Sync helpers — individual service sync
// ---------------------------------------------------------------------------

/**
 * Sync DATA plans from configured (or specified) provider
 * @param {Object} ServicePlan - ServicePlan mongoose model
 * @param {Object} [options]
 * @param {string} [options.providerName] - Provider to sync from. Defaults to configured provider.
 * @param {Object} [options.AdminConfig] - AdminConfig model for reading provider map
 */
async function syncDataPlans(ServicePlan, { providerName, AdminConfig } = {}) {
  const results = { synced: 0, skipped: 0, errors: [] };

  // Determine which provider to use
  let provider;
  if (providerName) {
    const { PROVIDERS } = providerRegistry;
    provider = PROVIDERS[providerName];
    if (!provider) {
      results.errors.push(`Unknown provider: ${providerName}`);
      return results;
    }
  } else {
    provider = await providerRegistry.getProvider('data', AdminConfig);
  }

  const providerLabel = provider.name || providerName || 'unknown';
  console.log(`[adminService] Syncing DATA plans from provider: ${providerLabel}...`);
  const dataNetworks = await provider.getDataNetworks();
  const dataNetworkList = dataNetworks?.networks || [];

  for (const network of dataNetworkList) {
    try {
      console.log(`[adminService] Fetching data plans for network: ${network.identifier}`);
      const plansResponse = await provider.getDataPlans(network.identifier);
      const plans = plansResponse?.plans || [];
      console.log(`[adminService] Got ${plans.length} data plans for ${network.identifier}`);

      for (const plan of plans) {
        const existing = await ServicePlan.findOne({
          service:  'data',
          provider: network.identifier,
          planCode: plan.plan_code,
        });

        if (existing) {
          results.skipped++;
        } else {
          const providerPrice = Number(plan.amount);
          await ServicePlan.create({
            service:       'data',
            provider:      network.identifier,
            planCode:      plan.plan_code,
            planName:      plan.label || plan.plan_code,
            description:   plan.description || plan.label,
            providerPrice: providerPrice,
            ourPrice:      providerPrice,
            prices:        initLevelPrices(providerPrice),
            metadata:      { label: plan.label, description: plan.description, syncedFromProvider: providerLabel },
            lastSyncedAt:  new Date(),
            _providerData: plan,
          });
          results.synced++;
        }
      }
    } catch (err) {
      console.error(`[adminService] DATA sync error for ${network.identifier}:`, err.message);
      results.errors.push(`DATA network ${network.identifier}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Sync CABLE plans from configured (or specified) provider
 * @param {Object} ServicePlan - ServicePlan mongoose model
 * @param {Object} [options]
 * @param {string} [options.providerName] - Provider to sync from. Defaults to configured provider.
 * @param {Object} [options.AdminConfig] - AdminConfig model for reading provider map
 */
async function syncCablePlans(ServicePlan, { providerName, AdminConfig } = {}) {
  const results = { synced: 0, skipped: 0, errors: [] };

  // Determine which provider to use
  let provider;
  if (providerName) {
    const { PROVIDERS } = providerRegistry;
    provider = PROVIDERS[providerName];
    if (!provider) {
      results.errors.push(`Unknown provider: ${providerName}`);
      return results;
    }
  } else {
    provider = await providerRegistry.getProvider('cable', AdminConfig);
  }

  const providerLabel = provider.name || providerName || 'unknown';
  console.log(`[adminService] Syncing CABLE plans from provider: ${providerLabel}...`);
  const cableProviders = await provider.getCableProviders();
  const cableProviderList = cableProviders?.providers || [];

  for (const cableProv of cableProviderList) {
    try {
      const plansResponse = await provider.getCablePlans(cableProv.identifier);
      const plans = plansResponse?.plans || [];

      for (const plan of plans) {
        const existing = await ServicePlan.findOne({
          service:  'cable',
          provider: cableProv.identifier,
          planCode: plan.plan_code,
        });

        if (existing) {
          results.skipped++;
        } else {
          const providerPrice = Number(plan.amount);
          await ServicePlan.create({
            service:       'cable',
            provider:      cableProv.identifier,
            planCode:      plan.plan_code,
            planName:      plan.display || plan.plan_code,
            description:   plan.description,
            providerPrice: providerPrice,
            ourPrice:      providerPrice,
            prices:        initLevelPrices(providerPrice),
            metadata:      { display: plan.display, description: plan.description, syncedFromProvider: providerLabel },
            lastSyncedAt:  new Date(),
            _providerData: plan,
          });
          results.synced++;
        }
      }
    } catch (err) {
      results.errors.push(`CABLE provider ${cableProv.identifier}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Sync ELECTRICITY plans from configured (or specified) provider
 * @param {Object} ServicePlan - ServicePlan mongoose model
 * @param {Object} [options]
 * @param {string} [options.providerName] - Provider to sync from. Defaults to configured provider.
 * @param {Object} [options.AdminConfig] - AdminConfig model for reading provider map
 */
async function syncElectricityPlans(ServicePlan, { providerName, AdminConfig } = {}) {
  const results = { synced: 0, skipped: 0, errors: [] };

  // Determine which provider to use
  let provider;
  if (providerName) {
    const { PROVIDERS } = providerRegistry;
    provider = PROVIDERS[providerName];
    if (!provider) {
      results.errors.push(`Unknown provider: ${providerName}`);
      return results;
    }
  } else {
    provider = await providerRegistry.getProvider('electricity', AdminConfig);
  }

  const providerLabel = provider.name || providerName || 'unknown';
  console.log(`[adminService] Syncing ELECTRICITY plans from provider: ${providerLabel}...`);
  try {
    const electricityResponse = await provider.getElectricityPlans();
    const electricityPlans = electricityResponse?.plans || [];

    for (const plan of electricityPlans) {
      // Use the disco identifier as the provider field (e.g., 'ikeja-electric')
      const discoIdentifier = plan.provider || plan.identifier || plan.plan_code || 'electricity';

      const existing = await ServicePlan.findOne({
        service:  'electricity',
        provider: discoIdentifier,
        planCode: plan.plan_code,
      });

      if (existing) {
        results.skipped++;
      } else {
        const providerPrice = Number(plan.min_amount);
        await ServicePlan.create({
          service:       'electricity',
          provider:      discoIdentifier,
          planCode:      plan.plan_code,
          planName:      plan.plan_name,
          description:   plan.plan_name,
          providerPrice: providerPrice,
          ourPrice:      providerPrice,
          prices:        initLevelPrices(providerPrice),
          metadata:      {
            plan_name:  plan.plan_name,
            min_amount: plan.min_amount,
            max_amount: plan.max_amount,
            type:       'prepaid',
            syncedFromProvider: providerLabel,
          },
          lastSyncedAt: new Date(),
          _providerData: plan,
        });
        results.synced++;
      }
    }
  } catch (err) {
    results.errors.push(`ELECTRICITY: ${err.message}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Sync all plans from Peyflex to ServicePlan DB
// ---------------------------------------------------------------------------

/**
 * Fetch all plans from Peyflex providers and save/update in ServicePlan collection
 * @param {Object} ServicePlan — the mongoose model (from tenant connection)
 * @returns {Object} { synced: number, skipped: number, errors: Array }
 */
async function syncAllPlans(ServicePlan, { providerName, AdminConfig } = {}) {
  const results = { synced: 0, skipped: 0, errors: [] };

  try {
    const dataResults = await syncDataPlans(ServicePlan, { providerName, AdminConfig });
    results.synced += dataResults.synced;
    results.skipped += dataResults.skipped;
    results.errors.push(...dataResults.errors);

    const cableResults = await syncCablePlans(ServicePlan, { providerName, AdminConfig });
    results.synced += cableResults.synced;
    results.skipped += cableResults.skipped;
    results.errors.push(...cableResults.errors);

    const electricityResults = await syncElectricityPlans(ServicePlan, { providerName, AdminConfig });
    results.synced += electricityResults.synced;
    results.skipped += electricityResults.skipped;
    results.errors.push(...electricityResults.errors);

    return results;
  } catch (err) {
    console.error('[adminService] Sync error:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Get all plans for admin dashboard (paginated)
// ---------------------------------------------------------------------------

async function getAllPlansForAdmin(ServicePlan, { service = null, provider = null, page = 1, limit = 50 } = {}) {
  const filter = { isActive: true };
  if (service) filter.service = service;
  if (provider) filter.provider = provider;

  const skip = (page - 1) * limit;

  const [plans, total] = await Promise.all([
    ServicePlan.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ServicePlan.countDocuments(filter),
  ]);

  return {
    plans,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Update plan prices
// ---------------------------------------------------------------------------

async function updatePlanPrice(ServicePlan, { service, provider, planCode, ourPrice }) {
  if (!service || !provider || !planCode || ourPrice === undefined) {
    throw new Error('service, provider, planCode, and ourPrice are required.');
  }

  const updated = await ServicePlan.findOneAndUpdate(
    { service, provider, planCode },
    { ourPrice: Number(ourPrice) },
    { new: true }
  );

  if (!updated) {
    throw new Error(`Plan not found: ${service} ${provider} ${planCode}`);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Bulk update prices
// ---------------------------------------------------------------------------

async function bulkUpdatePrices(ServicePlan, updates) {
  // updates = [{ service, provider, planCode, ourPrice }, ...]
  const results = { updated: 0, failed: 0, errors: [] };

  for (const update of updates) {
    try {
      await updatePlanPrice(ServicePlan, update);
      results.updated++;
    } catch (err) {
      results.failed++;
      results.errors.push(err.message);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Level-specific pricing helpers
// ---------------------------------------------------------------------------

/**
 * Get prices for a specific plan (all levels)
 */
async function getPlanLevelPrices(ServicePlan, planId) {
  const plan = await ServicePlan.findById(planId).lean();
  if (!plan) {
    throw new Error('Plan not found.');
  }
  return {
    planId:      plan._id,
    planName:    plan.planName,
    service:     plan.service,
    provider:    plan.provider,
    providerPrice: plan.providerPrice,
    prices:      plan.prices || initLevelPrices(plan.ourPrice),
  };
}

/**
 * Update level-specific prices for a plan
 * @param {Object} ServicePlan
 * @param {string} planId
 * @param {Object} prices - { normal: 100, affiliate: 95, top_user: 90, api_user: 85 }
 */
async function updatePlanLevelPrices(ServicePlan, planId, prices) {
  // Validate that only valid level keys are provided
  const validKeys = USER_LEVELS;
  const updateData = {};
  let hasValidKeys = false;

  for (const key of Object.keys(prices || {})) {
    if (validKeys.includes(key) && prices[key] !== undefined && prices[key] !== null) {
      updateData[`prices.${key}`] = Number(prices[key]);
      hasValidKeys = true;
    }
  }

  if (!hasValidKeys) {
    throw new Error('No valid level prices provided. Valid levels: ' + validKeys.join(', '));
  }

  const updated = await ServicePlan.findByIdAndUpdate(
    planId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new Error('Plan not found.');
  }

  return {
    planId:   updated._id,
    planName: updated.planName,
    service:  updated.service,
    provider: updated.provider,
    prices:   updated.prices,
  };
}

/**
 * Update a user's level
 */
async function updateUserLevel(User, userId, level) {
  if (!USER_LEVELS.includes(level)) {
    throw new Error(`Invalid level: ${level}. Valid levels: ${USER_LEVELS.join(', ')}`);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { level },
    { new: true }
  ).select('-password');

  if (!user) {
    throw new Error('User not found.');
  }

  return user;
}

/**
 * Get airtime profit levels config from AdminConfig
 */
async function getAirtimeProfitLevels(AdminConfig) {
  if (!AdminConfig) return USER_LEVELS.reduce((acc, l) => { acc[l] = 0; return acc; }, {});

  const config = await AdminConfig.findOne({ key: 'airtimeProfitPercent' });
  const value = config ? config.value : {};

  // Ensure all levels have a value
  const result = {};
  for (const level of USER_LEVELS) {
    result[level] = (value && value[level] !== undefined) ? Number(value[level]) : 0;
  }

  return result;
}

/**
 * Update airtime profit levels config
 */
async function updateAirtimeProfitLevels(AdminConfig, profitMap) {
  if (!AdminConfig) throw new Error('AdminConfig model not available.');

  // Validate keys
  const validKeys = USER_LEVELS;
  for (const key of Object.keys(profitMap || {})) {
    if (!validKeys.includes(key)) {
      throw new Error(`Invalid level: ${key}. Valid levels: ${validKeys.join(', ')}`);
    }
    const val = Number(profitMap[key]);
    if (val < 0 || val > 100) {
      throw new Error(`Profit percent for ${key} must be between 0 and 100.`);
    }
  }

  // Merge with existing values
  const existing = await getAirtimeProfitLevels(AdminConfig);
  const merged = { ...existing, ...profitMap };

  const config = await AdminConfig.findOneAndUpdate(
    { key: 'airtimeProfitPercent' },
    {
      key: 'airtimeProfitPercent',
      value: merged,
      description: 'Airtime profit percentage by user level',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return config.value;
}

// ---------------------------------------------------------------------------
// Get plans for user (show ourPrice, not providerPrice)
// ---------------------------------------------------------------------------

async function getPlansForUser(ServicePlan, { service, provider, limit = 50 } = {}) {
  const filter = { isActive: true };
  if (service) filter.service = service;
  if (provider) filter.provider = provider;

  const plans = await ServicePlan.find(filter)
    .select('service provider planCode planName description ourPrice metadata')
    .limit(limit)
    .lean();

  return plans;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  USER_LEVELS,
  initLevelPrices,
  syncAllPlans,
  syncDataPlans,
  syncCablePlans,
  syncElectricityPlans,
  getAllPlansForAdmin,
  updatePlanPrice,
  bulkUpdatePrices,
  getPlansForUser,
  getPlanLevelPrices,
  updatePlanLevelPrices,
  updateUserLevel,
  getAirtimeProfitLevels,
  updateAirtimeProfitLevels,
};