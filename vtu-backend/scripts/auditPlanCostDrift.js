'use strict';

// scripts/auditPlanCostDrift.js
//
// READ-ONLY audit of data-plan cost drift.
//
// Every data purchase records its profit as
//     profit = (sellingPrice - providerPrice) * 100
// where `providerPrice` is read from the ServicePlan document at purchase time.
// A plan code is unique only *per network*, never per upstream API — datastation,
// gladtidings and geodnatech reuse the same numeric codes for unrelated products.
// When a sync overwrites a plan's cost with another API's plan of the same code,
// every later sale books a fictitious profit or loss.
//
// `_providerData` holds the provider payload captured when the plan document was
// CREATED (it is never refreshed on sync), so it is a reliable "original cost"
// reference. Any plan whose stored providerPrice disagrees with it has been
// overwritten by a colliding plan from a different provider.
//
// Usage:
//   node vtu-backend/scripts/auditPlanCostDrift.js
//   node vtu-backend/scripts/auditPlanCostDrift.js --tenant=demo --limit=100

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { loadTenantSecrets, getAllTenantSecrets } = require('../src/services/tenantConfigService');
const { connectTenantDb, getAllTenantConnections } = require('../src/services/tenantDbService');

const USER_LEVELS = ['normal', 'affiliate', 'top_user', 'api_user'];

function parseArgs(argv) {
  const out = { tenant: null, limit: 50 };
  for (const arg of argv) {
    const [key, value] = String(arg).split('=');
    if (key === '--tenant' && value) out.tenant = value;
    if (key === '--limit' && value) out.limit = Number(value) || out.limit;
  }
  return out;
}

function naira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function lowestSellingPrice(plan) {
  const candidates = USER_LEVELS
    .map((level) => Number(plan.prices && plan.prices[level]))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (Number(plan.ourPrice) > 0) candidates.push(Number(plan.ourPrice));
  return candidates.length ? Math.min(...candidates) : 0;
}

/**
 * @returns {Array} plans whose stored cost differs from the creation snapshot
 */
function findDrift(plans) {
  const drift = [];

  for (const plan of plans) {
    const snapshot = plan._providerData || {};
    const snapshotCost = Number(snapshot.amount);
    if (!Number.isFinite(snapshotCost) || snapshotCost <= 0) continue;

    const storedCost = Number(plan.providerPrice) || 0;
    const delta = storedCost - snapshotCost;
    if (Math.abs(delta) < 1) continue;

    const minPrice = lowestSellingPrice(plan);
    drift.push({
      plan,
      snapshotCost,
      snapshotLabel: snapshot.label || snapshot.description || '',
      storedCost,
      delta,
      minPrice,
      // Would a purchase right now record a loss, or is the cost understated
      // (profit looks better than it is)?
      sellsBelowCost: minPrice > 0 && minPrice < storedCost,
      visible: plan.visibleOnMobile !== false,
    });
  }

  drift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return drift;
}

function printTenantReport(tenantId, plans, limit) {
  const drift = findDrift(plans);

  console.log('');
  console.log('='.repeat(100));
  console.log(`TENANT "${tenantId}" — ${plans.length} data plan(s), ${drift.length} with cost drift`);
  console.log('='.repeat(100));

  if (!drift.length) {
    console.log('  No drift detected — every stored cost matches its creation snapshot.');
    return { total: plans.length, drifted: 0, sellsBelowCost: 0 };
  }

  let sellsBelowCost = 0;

  for (const row of drift.slice(0, limit)) {
    const plan = row.plan;

    const flags = [
      row.sellsBelowCost ? 'SELLS BELOW COST' : 'cost changed',
      row.visible ? 'VISIBLE' : 'hidden',
    ].join(' | ');

    console.log('');
    console.log(`  ${plan.provider}/${plan.planCode}  "${plan.planName}"  [${flags}]`);
    console.log(`    stored cost   : ${naira(row.storedCost)}`);
    console.log(`    snapshot cost : ${naira(row.snapshotCost)}` +
      (row.snapshotLabel ? `  ("${row.snapshotLabel}", the plan originally created for this code)` : ''));
    console.log(`    difference    : ${row.delta > 0 ? '+' : ''}${naira(row.delta)}`);
    console.log(`    lowest price  : ${naira(row.minPrice)}`);
    console.log(`    profit/sale   : ${naira(row.minPrice - row.storedCost)} recorded, ` +
      `${naira(row.minPrice - row.snapshotCost)} if the snapshot cost were used`);
  }

  if (drift.length > limit) {
    console.log('');
    console.log(`  … ${drift.length - limit} more (raise --limit to see them)`);
  }

  // Count over ALL drifted plans — not just the printed ones.
  sellsBelowCost = drift.filter((row) => row.sellsBelowCost).length;

  const understated = drift.length - sellsBelowCost;
  console.log('');
  console.log(`  Summary: ${drift.length} plan(s) drifted — ${sellsBelowCost} would record a LOSS on sale, ` +
    `${understated} have a wrong cost basis (profit figures are off).`);
  console.log('  Fix a collided plan with:');
  console.log('    node vtu-backend/scripts/repairPlanCodeCollision.js --provider=<network> --planCode=<code> --apply');
  console.log('  Then re-run a DATA sync — colliding plans from other APIs are now skipped instead of merged.');

  return { total: plans.length, drifted: drift.length, sellsBelowCost };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('[auditPlanCostDrift] Loading tenant configuration…');
  await loadTenantSecrets();

  const tenants = Object.values(getAllTenantSecrets())
    .filter((tenant) => !args.tenant || tenant.tenantId === args.tenant);

  if (!tenants.length) {
    console.error(`[auditPlanCostDrift] No tenant matched${args.tenant ? ` "${args.tenant}"` : ''}.`);
    process.exitCode = 1;
    return;
  }

  for (const tenant of tenants) {
    await connectTenantDb(tenant);
  }

  const connections = getAllTenantConnections();
  let grandTotal = { total: 0, drifted: 0, sellsBelowCost: 0 };

  for (const [tenantId, connection] of Object.entries(connections)) {
    const ServicePlan = connection.models.ServicePlan;
    if (!ServicePlan) {
      console.warn(`[auditPlanCostDrift] Tenant "${tenantId}" has no ServicePlan model — skipping.`);
      continue;
    }

    const plans = await ServicePlan.find({ service: 'data' }).lean();
    const summary = printTenantReport(tenantId, plans, args.limit);
    grandTotal = {
      total: grandTotal.total + summary.total,
      drifted: grandTotal.drifted + summary.drifted,
      sellsBelowCost: grandTotal.sellsBelowCost + summary.sellsBelowCost,
    };
  }

  console.log('');
  console.log('='.repeat(100));
  console.log(`TOTAL: ${grandTotal.total} data plan(s) checked, ${grandTotal.drifted} drifted, ` +
    `${grandTotal.sellsBelowCost} would record a loss on sale.`);
  console.log('='.repeat(100));

  for (const connection of Object.values(connections)) {
    await connection.close();
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error('[auditPlanCostDrift] FAILED:', err.message);
    process.exit(1);
  });
