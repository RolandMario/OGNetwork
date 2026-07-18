'use strict';

// src/services/tenantDbService.js

const mongoose = require('mongoose');
const { getAllTenantSecrets, getTenantSecret } = require('./tenantConfigService');

// Model definitions
const { schema: UserSchema,        modelName: UserModelName        } = require('../models/User');
const { schema: WalletSchema,      modelName: WalletModelName      } = require('../models/Wallet');
const { schema: TransactionSchema, modelName: TransactionModelName } = require('../models/Transaction');
const { schema: ServicePlan,       modelName: ServiceModeName      } = require('../models/ServicePlan');
const { schema: AdminConfigSchema, modelName: AdminConfigModelName } = require('../models/AdminConfig');

// All tenant-scoped models — add new models here as the project grows
const TENANT_MODELS = [
  { schema: UserSchema,        modelName: UserModelName        },
  { schema: WalletSchema,      modelName: WalletModelName      },
  { schema: TransactionSchema, modelName: TransactionModelName },
  { schema: ServicePlan,       modelName: ServiceModeName      },
  { schema: AdminConfigSchema, modelName: AdminConfigModelName },
];

// In-memory connection pool: { [tenantId]: mongoose.Connection }
const tenantConnections = {};

// ---------------------------------------------------------------------------
// URI builder
// ---------------------------------------------------------------------------

function buildTenantUri(dbName) {
  const base =
    process.env.MONGODB_BASE_URI ||
    'mongodb+srv://RolandMario:gzS5dvin2g8MQThj@cluster-vtu.mx2yyag.mongodb.net/?appName=Cluster-vtu';

  if (!base) {
    throw new Error('[tenantDbService] MONGODB_BASE_URI is not set. Check vtu-backend/.env.');
  }

  const [baseWithoutQuery, queryString] = base.split('?');
  const cleanBase = baseWithoutQuery.replace(/\/$/, '');
  const query = queryString
    ? `retryWrites=true&w=majority&${queryString}`
    : 'retryWrites=true&w=majority';

  return `${cleanBase}/${dbName}?${query}`;
}

// ---------------------------------------------------------------------------
// Model registration
// ---------------------------------------------------------------------------

/**
 * Registers all tenant-scoped models onto a specific connection.
 * Safe to call multiple times — skips already-registered models.
 */
function registerModelsOnConnection(connection) {
  for (const { schema, modelName } of TENANT_MODELS) {
    if (!connection.models[modelName]) {
      connection.model(modelName, schema);
    }
  }
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

async function connectTenantDb(tenant) {
  const { tenantId, dbName } = tenant;

  if (tenantConnections[tenantId]) {
    console.log(`[tenantDbService] Connection for "${tenantId}" already exists — skipping.`);
    return;
  }

  const uri = buildTenantUri(dbName);
  const connection = await mongoose.createConnection(uri).asPromise();

  registerModelsOnConnection(connection);

  tenantConnections[tenantId] = connection;

  console.log(
    `[tenantDbService] Connected "${tenantId}" -> "${dbName}" | ` +
    `Models: [${Object.keys(connection.models).join(', ')}]`
  );
}

async function connectAllTenantDbs() {
  const tenants = Object.values(getAllTenantSecrets());

  if (!tenants.length) {
    console.warn(
      '[tenantDbService] No tenants found — skipping tenant DB connections. ' +
      'Seed at least one document into the Master DB "tenants" collection.'
    );
    return;
  }

  console.log(`[tenantDbService] Opening connections for ${tenants.length} tenant(s)…`);
  await Promise.all(tenants.map(connectTenantDb));
  console.log('[tenantDbService] All tenant DB connections established.');
}

// ---------------------------------------------------------------------------
// Runtime lookups
// ---------------------------------------------------------------------------

/**
 * Returns the cached mongoose connection for a tenant.
 * If missing (e.g., due to cold-start or unseeded cache), attempts
 * to create the connection on-demand using the tenant config.
 * Throws a typed error if tenant is unknown — caught by tenantMiddleware.
 */
async function getTenantConnection(tenantId) {
  let connection = tenantConnections[tenantId];

  // Lazy fallback: create connection on-demand if missing
  if (!connection) {
    console.warn(`[tenantDbService] Cache miss for "${tenantId}" — attempting lazy connect.`);

    const secret = getTenantSecret(tenantId);

    if (!secret) {
      const err = new Error(
        `[tenantDbService] No connection found for tenant "${tenantId}". ` +
        'Ensure this tenant exists in the Master DB and the server has been restarted.'
      );
      err.statusCode = 404;
      throw err;
    }

    // Single-flight guard to avoid duplicate connects for same tenant
    if (!connectTenantDb._pending[tenantId]) {
      connectTenantDb._pending[tenantId] = connectTenantDb(secret)
        .then(() => {
          delete connectTenantDb._pending[tenantId];
        })
        .catch((err) => {
          delete connectTenantDb._pending[tenantId];
          throw err;
        });
    }

    try {
      await connectTenantDb._pending[tenantId];
      connection = tenantConnections[tenantId];
    } catch (err) {
      throw new Error(
        `[tenantDbService] Failed to connect tenant "${tenantId}": ${err.message}`
      );
    }
  }

  return connection;
}

// In-flight connection guard (prevents duplicate parallel connects)
connectTenantDb._pending = {};


const getTenantDb = getTenantConnection; // alias

function getAllTenantConnections() {
  return { ...tenantConnections };
}

module.exports = {
  connectAllTenantDbs,
  connectTenantDb,
  getTenantConnection,
  getTenantDb,
  getAllTenantConnections,
};