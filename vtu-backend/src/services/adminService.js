'use strict';

// src/services/adminService.js

const vtuService = require('./vtuService');

// ---------------------------------------------------------------------------
// Sync helpers — individual service sync
// ---------------------------------------------------------------------------

/**
 * Sync DATA plans from Peyflex
 */
async function syncDataPlans(ServicePlan) {
  const results = { synced: 0, skipped: 0, errors: [] };

  console.log('[adminService] Syncing DATA plans...');
  const dataNetworks = await vtuService.getDataNetworks();
  const dataNetworkList = dataNetworks?.networks || [];

  for (const network of dataNetworkList) {
    try {
      console.log(`[adminService] Fetching data plans for network: ${network.identifier}`);
      const plansResponse = await vtuService.getDataPlans(network.identifier);
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
          await ServicePlan.create({
            service:       'data',
            provider:      network.identifier,
            planCode:      plan.plan_code,
            planName:      plan.label || plan.plan_code,
            description:   plan.description || plan.label,
            providerPrice: Number(plan.amount),
            ourPrice:      Number(plan.amount),
            metadata:      { label: plan.label, description: plan.description },
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
 * Sync CABLE plans from Peyflex
 */
async function syncCablePlans(ServicePlan) {
  const results = { synced: 0, skipped: 0, errors: [] };

  console.log('[adminService] Syncing CABLE plans...');
  const cableProviders = await vtuService.getCableProviders();
  const cableProviderList = cableProviders?.providers || [];

  for (const provider of cableProviderList) {
    try {
      const plansResponse = await vtuService.getCablePlans(provider.identifier);
      const plans = plansResponse?.plans || [];

      for (const plan of plans) {
        const existing = await ServicePlan.findOne({
          service:  'cable',
          provider: provider.identifier,
          planCode: plan.plan_code,
        });

        if (existing) {
          results.skipped++;
        } else {
          await ServicePlan.create({
            service:       'cable',
            provider:      provider.identifier,
            planCode:      plan.plan_code,
            planName:      plan.display || plan.plan_code,
            description:   plan.description,
            providerPrice: Number(plan.amount),
            ourPrice:      Number(plan.amount),
            metadata:      { display: plan.display, description: plan.description },
            lastSyncedAt:  new Date(),
            _providerData: plan,
          });
          results.synced++;
        }
      }
    } catch (err) {
      results.errors.push(`CABLE provider ${provider.identifier}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Sync ELECTRICITY plans from Peyflex
 */
async function syncElectricityPlans(ServicePlan) {
  const results = { synced: 0, skipped: 0, errors: [] };

  console.log('[adminService] Syncing ELECTRICITY plans...');
  try {
    const electricityResponse = await vtuService.getElectricityPlans();
    const electricityPlans = electricityResponse?.plans || [];

    for (const plan of electricityPlans) {
      const existing = await ServicePlan.findOne({
        service:  'electricity',
        provider: 'electricity',
        planCode: plan.plan_code,
      });

      if (existing) {
        results.skipped++;
      } else {
        await ServicePlan.create({
          service:       'electricity',
          provider:      'electricity',
          planCode:      plan.plan_code,
          planName:      plan.plan_name,
          description:   plan.plan_name,
          providerPrice: Number(plan.min_amount),
          ourPrice:      Number(plan.min_amount),
          metadata:      {
            plan_name:  plan.plan_name,
            min_amount: plan.min_amount,
            max_amount: plan.max_amount,
            type:       'prepaid',
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
async function syncAllPlans(ServicePlan) {
  const results = { synced: 0, skipped: 0, errors: [] };

  try {
    const dataResults = await syncDataPlans(ServicePlan);
    results.synced += dataResults.synced;
    results.skipped += dataResults.skipped;
    results.errors.push(...dataResults.errors);

    const cableResults = await syncCablePlans(ServicePlan);
    results.synced += cableResults.synced;
    results.skipped += cableResults.skipped;
    results.errors.push(...cableResults.errors);

    const electricityResults = await syncElectricityPlans(ServicePlan);
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
  syncAllPlans,
  syncDataPlans,
  syncCablePlans,
  syncElectricityPlans,
  getAllPlansForAdmin,
  updatePlanPrice,
  bulkUpdatePrices,
  getPlansForUser,
};
