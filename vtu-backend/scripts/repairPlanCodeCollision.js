'use strict';

// scripts/repairPlanCodeCollision.js
//
// Repairs ONE data plan whose providerPrice (and name) were overwritten by a
// different VTU API's plan that shares the same numeric plan code, then fixes the
// profit recorded on that plan's past transactions.
//
// The original provider payload is preserved in `_providerData` (written once, at
// creation), so the plan can be restored from it without calling any API.
//
// Usage (dry-run by default — prints what would change):
//   node vtu-backend/scripts/repairPlanCodeCollision.js --provider=airtel --planCode=639
//   node vtu-backend/scripts/repairPlanCodeCollision.js --provider=airtel --planCode=639 --apply
//   … add --tenant=demo to limit it to a single tenant.

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { loadTenantSecrets, getAllTenantSecrets } = require('../src/services/tenantConfigService');
const { connectTenantDb, getAllTenantConnections } = require('../src/services/tenantDbService');

function parseArgs(argv) {
  const out = { provider: null, planCode: null, tenant: null, apply: false };
  for (const arg of argv) {
    const [key, value] = String(arg).split('=');
    if (key === '--provider' && value) out.provider = value;
    if (key === '--planCode' && value) out.planCode = value;
    if (key === '--tenant' && value) out.tenant = value;
    if (key === '--apply') out.apply = true;
  }
  return out;
}

function naira(value) {
  return `₦${(Number(value) || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function repairTenant(tenantId, connection, args) {
  const ServicePlan = connection.models.ServicePlan;
  const Transaction = connection.models.Transaction;
  const filter = { service: 'data', provider: args.provider, planCode: String(args.planCode) };

  const plan = await ServicePlan.findOne(filter);
  if (!plan) {
    console.log(`[${tenantId}] no data plan ${args.provider}/${args.planCode} — nothing to repair.`);
    return;
  }

  const snapshot = plan._providerData || {};
  const snapshotCost = Number(snapshot.amount);
  const snapshotLabel = snapshot.label || '';
  const snapshotDescription = snapshot.description || snapshot.label || '';

  if (!Number.isFinite(snapshotCost) || snapshotCost <= 0) {
    console.error(
      `[${tenantId}] ${args.provider}/${args.planCode} has no usable _providerData.amount snapshot — ` +
      'cannot restore it automatically. Re-sync this network from the owning provider instead.'
    );
    return;
  }

  const storedCost = Number(plan.providerPrice) || 0;

  console.log('');
  console.log('-'.repeat(100));
  console.log(`[${tenantId}] ${args.provider}/${args.planCode}`);
  console.log(`  current: "${plan.planName}" — cost ${naira(storedCost)}`);
  console.log(`  restore: "${snapshotLabel || plan.planName}" — cost ${naira(snapshotCost)}`);

  // Recompute profit for every successful purchase of this plan using the
  // restored cost. profit (kobo) = amount debited (kobo) − cost (kobo).
  const transactions = await Transaction.find({
    type: 'DATA',
    status: 'SUCCESS',
    'details.network': args.provider,
    'details.planId': String(args.planCode),
  }).select('_id amount profit createdAt transactionReference').lean();

  const updates = transactions
    .map((tx) => ({
      tx,
      newProfit: Math.round((Number(tx.amount) || 0) - snapshotCost * 100),
    }))
    .filter((row) => Number(row.tx.profit) !== row.newProfit);

  const profitBefore = transactions.reduce((sum, tx) => sum + (Number(tx.profit) || 0), 0) / 100;
  const profitAfter = transactions.reduce((sum, tx) => {
    const row = updates.find((u) => String(u.tx._id) === String(tx._id));
    return sum + (row ? row.newProfit : (Number(tx.profit) || 0));
  }, 0) / 100;

  console.log(`  transactions on this plan: ${transactions.length}, needing a profit fix: ${updates.length}`);
  for (const row of updates.slice(0, 20)) {
    console.log(
      `    ${row.tx.transactionReference || row.tx._id}  ${monthKey(row.tx.createdAt)}  ` +
      `amount ${naira(row.tx.amount / 100)}  profit ${naira((row.tx.profit || 0) / 100)} → ${naira(row.newProfit / 100)}`
    );
  }
  if (updates.length > 20) console.log(`    … ${updates.length - 20} more`);
  console.log(`  profit on this plan: ${naira(profitBefore)} → ${naira(profitAfter)}`);

  if (!args.apply) {
    console.log('  DRY RUN — re-run with --apply to write these changes.');
    return;
  }

  const metadata = {
    ...(plan.metadata || {}),
    label: snapshotLabel || plan.planName,
    description: snapshotDescription || plan.description || '',
    // The cost now comes from the owning provider's creation snapshot again.
    priceSource: plan.metadata?.syncedFromProvider || 'snapshot',
    repairedAt: new Date(),
    repairedFromSnapshot: true,
  };

  await ServicePlan.updateOne({ _id: plan._id }, {
    $set: {
      planName: snapshotLabel || plan.planName,
      description: snapshotDescription || plan.description || '',
      providerPrice: snapshotCost,
      metadata,
    },
  });

  let fixed = 0;
  for (const row of updates) {
    await Transaction.updateOne({ _id: row.tx._id }, { $set: { profit: row.newProfit } });
    fixed++;
  }

  console.log(`  APPLIED — plan restored from snapshot, ${fixed} transaction profit value(s) corrected.`);

  // Verification: profit totals per month for the whole tenant, so the repaired
  // month can be compared against the admin dashboard.
  const monthly = await Transaction.aggregate([
    { $match: { status: 'SUCCESS', type: { $in: ['AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'] } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
        totalProfit: { $sum: '$profit' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  console.log('  monthly recorded profit (gross, whole tenant):');
  for (const row of monthly) {
    console.log(`    ${row._id}  ${naira(row.totalProfit / 100)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.provider || !args.planCode) {
    console.error('Usage: node vtu-backend/scripts/repairPlanCodeCollision.js --provider=<network> --planCode=<code> [--tenant=<id>] [--apply]');
    process.exit(1);
    return;
  }

  console.log(`[repairPlanCodeCollision] ${args.apply ? 'APPLY' : 'DRY RUN'} — ${args.provider}/${args.planCode}`);
  await loadTenantSecrets();

  const tenants = Object.values(getAllTenantSecrets())
    .filter((tenant) => !args.tenant || tenant.tenantId === args.tenant);

  if (!tenants.length) {
    console.error(`[repairPlanCodeCollision] No tenant matched${args.tenant ? ` "${args.tenant}"` : ''}.`);
    process.exit(1);
    return;
  }

  for (const tenant of tenants) {
    await connectTenantDb(tenant);
  }

  const connections = getAllTenantConnections();
  for (const [tenantId, connection] of Object.entries(connections)) {
    await repairTenant(tenantId, connection, args);
  }

  for (const connection of Object.values(connections)) {
    await connection.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[repairPlanCodeCollision] FAILED:', err.message);
    process.exit(1);
  });
