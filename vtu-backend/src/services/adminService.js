'use strict';

// src/services/adminService.js

const vtuService = require('./vtuService');
const providerRegistry = require('./providerRegistry');

// User level constants
const USER_LEVELS = ['normal', 'affiliate', 'top_user', 'api_user'];

// Data plan types that are promotional / restricted offers (Gifting, SME,
// Talkmore, Corporate, ...) and frequently fail eligibility checks on the user's
// own number (see the provider "not eligible for this offer" errors). By default
// these are hidden from the mobile app unless an admin explicitly turns them on.
const RESTRICTED_PLAN_TYPES = [
  'gifting',
  'corporate gifting',
  'corporate',
  'awoof',
  'sme',
  'data share',
  'special',
  'talkmore',
  'night',
];

/**
 * Whether a plan type is a restricted/promotional offer that should be hidden
 * from the mobile app by default.
 * @param {string} type - plan_type (e.g. "Gifting", "SME", "Regular")
 */
function isRestrictedPlanType(type) {
  const t = String(type || '').trim().toLowerCase();
  return RESTRICTED_PLAN_TYPES.includes(t);
}

/**
 * Effective mobile visibility for a plan. An admin's explicit choice
 * (visibleOnMobile true/false) always wins — that is the single source of truth.
 *
 * For legacy plans where the field was never set (created before this feature):
 *  - Data plans default to HIDDEN (the switch is authoritative, so nothing shows
 *    unless an admin explicitly turns it on). This fixes data promo/gifting
 *    plans showing up when only a few were switched on.
 *  - Cable / electricity plans have no restricted-plan-type concept and have
 *    always been shown, so they default to VISIBLE.
 * @param {Object} plan - ServicePlan document/lean
 */
function planVisibleOnMobile(plan) {
  if (typeof plan.visibleOnMobile === 'boolean') return plan.visibleOnMobile;
  return plan.service !== 'data';
}

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
  const results = { synced: 0, updated: 0, skipped: 0, errors: [] };

  // Resolve the provider(s) to sync from. When the configured provider is
  // "ALL API", sync from every VTU API in ALL_API_PROVIDERS so all of them
  // become active in the service plans.
  let providers;
  try {
    providers = await providerRegistry.getProvidersForService('data', AdminConfig, providerName);
  } catch (err) {
    results.errors.push(err.message);
    return results;
  }

  for (const provider of providers) {
    const providerLabel = provider.name || 'unknown';
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
          const providerPrice = Number(plan.amount) > 0 ? Number(plan.amount) : 0;

          // Fields we always refresh on sync (provider data + active-provider tag).
          // NOTE: we deliberately do NOT touch `ourPrice` or `prices` for existing
          // plans, so admin price edits made in the dashboard are preserved.
          const update = {
            planName:      plan.label || plan.plan_code,
            description:   plan.description || plan.label,
            providerPrice,
            metadata:      {
              label:               plan.label || plan.plan_code,
              description:         plan.description || plan.label,
              plan_type:           plan.plan_type || '',
              validity:            plan.validity || '',
              syncedFromProvider:  providerLabel,
            },
            lastSyncedAt:  new Date(),
            isActive:      true,
          };

          const existing = await ServicePlan.findOne({
            service:  'data',
            provider: network.identifier,
            planCode: plan.plan_code,
          });

          if (existing) {
            // Existing plan — refresh provider data. When a plan already belongs
            // to another provider (e.g. the same plan code exists on datastation
            // and geodnatech), KEEP the original owner's tag instead of flipping
            // it to whichever provider iterated last. This prevents an "ALL API"
            // data sync from silently re-tagging the active provider's plans
            // (which would break the mobile app's active-provider filter).
            if (existing.metadata?.syncedFromProvider && existing.metadata.syncedFromProvider !== providerLabel) {
              update.metadata = {
                ...existing.metadata,
                ...update.metadata,
                syncedFromProvider: existing.metadata.syncedFromProvider,
              };
            }
            await ServicePlan.updateOne({ _id: existing._id }, { $set: update });
            results.updated++;
          } else {
            // Brand-new plan
            await ServicePlan.create({
              service:       'data',
              provider:      network.identifier,
              planCode:      plan.plan_code,
              ourPrice:      providerPrice,
              prices:        initLevelPrices(providerPrice),
              // Data plans are hidden from mobile by default — the admin switch is
              // the single source of truth for what shows on the user's app.
              visibleOnMobile: false,
              ...update,
            });
            results.synced++;
          }
        }
      } catch (err) {
        console.error(`[adminService] DATA sync error for ${network.identifier}:`, err.message);
        results.errors.push(`DATA network ${network.identifier}: ${err.message}`);
      }
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

  // Resolve the provider(s) to sync from — supports "ALL API" (all VTU APIs).
  let providers;
  try {
    providers = await providerRegistry.getProvidersForService('cable', AdminConfig, providerName);
  } catch (err) {
    results.errors.push(err.message);
    return results;
  }

  for (const provider of providers) {
    const providerLabel = provider.name || 'unknown';
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
  const results = { synced: 0, updated: 0, skipped: 0, errors: [] };

  // Resolve the provider(s) to sync from — supports "ALL API" (all VTU APIs).
  let providers;
  try {
    providers = await providerRegistry.getProvidersForService('electricity', AdminConfig, providerName);
  } catch (err) {
    results.errors.push(err.message);
    return results;
  }

  for (const provider of providers) {
    const providerLabel = provider.name || 'unknown';
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
          // The ServicePlan unique index is { service, provider, planCode }, so a
          // disco-plan key can exist only once across ALL VTU providers. Some
          // providers share the same disco slugs AND numeric disco_ids (e.g.
          // datastation 1-11 and geodnatech 1-12), so without this re-tag the
          // second provider's plans would all be skipped and only DISCOs unique to
          // it (e.g. geodnatech's Aba Electric = 12) would ever be stored.
          if (existing.metadata?.syncedFromProvider === providerLabel) {
            // Same provider already owns this plan — leave admin pricing untouched.
            results.skipped++;
          } else {
            // The plan key exists but belongs to a different VTU provider —
            // re-tag it to the CURRENT active provider so the electricity plans
            // endpoint shows it. Prices (ourPrice/prices) are preserved so no
            // admin customization is lost.
            await ServicePlan.updateOne(
              { _id: existing._id },
              {
                $set: {
                  planName:    plan.plan_name,
                  description: plan.plan_name,
                  providerPrice: Number(plan.min_amount),
                  metadata: {
                    ...(existing.metadata || {}),
                    plan_name:         plan.plan_name,
                    min_amount:        plan.min_amount,
                    max_amount:        plan.max_amount,
                    type:              'prepaid',
                    syncedFromProvider: providerLabel,
                  },
                  lastSyncedAt: new Date(),
                  _providerData: plan,
                },
              }
            );
            results.updated++;
          }
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
      results.errors.push(`ELECTRICITY (${providerLabel}): ${err.message}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Sync all plans from Peyflex to ServicePlan DB
// ---------------------------------------------------------------------------

/**
 * Fetch all plans from the VTU providers and save/update in ServicePlan collection.
 * @param {Object} ServicePlan — the mongoose model (from tenant connection)
 * @param {Object} [options]
 * @param {string} [options.providerName] - Provider to sync ALL services from (defaults to configured providers).
 * @param {string} [options.dataProviderName] - Optional override for the DATA service only.
 *   Defaults to 'all' so the admin catalog always includes datastation, gladtidings
 *   AND geodnatech data plans (previously only the single active data provider's
 *   plans were imported — e.g. switching the active data provider to geodnatech
 *   then showed an empty/never-synced data set).
 * @param {Object} [options.AdminConfig]
 * @returns {Object} { synced, updated, skipped, errors }
 */
async function syncAllPlans(ServicePlan, { providerName, dataProviderName, AdminConfig } = {}) {
  const results = { synced: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const dataResults = await syncDataPlans(ServicePlan, { providerName: dataProviderName || providerName, AdminConfig });
    results.synced += dataResults.synced;
    results.updated += dataResults.updated;
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
 * Set whether a plan is shown on the user's mobile app (the admin switch).
 * @param {Object} ServicePlan
 * @param {string} planId
 * @param {boolean} visibleOnMobile
 */
async function updatePlanVisibility(ServicePlan, planId, visibleOnMobile) {
  const updated = await ServicePlan.findByIdAndUpdate(
    planId,
    { visibleOnMobile: Boolean(visibleOnMobile) },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new Error('Plan not found.');
  }

  return updated;
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

  let plans = await ServicePlan.find(filter)
    .select('service provider planCode planName description ourPrice prices metadata visibleOnMobile')
    .limit(limit)
    .lean();

  // Hide plans the admin has turned off on mobile (restricted types default off)
  plans = plans.filter((p) => planVisibleOnMobile(p));

  return plans;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  USER_LEVELS,
  RESTRICTED_PLAN_TYPES,
  isRestrictedPlanType,
  planVisibleOnMobile,
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
  updatePlanVisibility,
  updateUserLevel,
  getAirtimeProfitLevels,
  updateAirtimeProfitLevels,
};