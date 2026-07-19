'use strict';

// src/services/tenantConfigService.js

const mongoose = require('mongoose');

// In-memory store: { [tenantId]: { tenantId, dbName, paystackSecretKey } }
const tenantSecretsCache = {};

// Index for O(1) webhook lookup: { [paystackSecretKey]: tenantConfig }
const secretKeyIndex = {};

let masterConnection = null;

function getMasterConnection() {
  if (!masterConnection) {
    throw new Error(
      '[tenantConfigService] Master DB connection not initialised. ' +
      'Ensure loadTenantSecrets() has been awaited first.'
    );
  }
  return masterConnection;
}

/**
 * Core function that connects to Master DB and loads tenant configs.
 * Can be called both at boot time and lazily on-demand.
 */
async function loadTenantSecrets() {
  const MASTER_URI = process.env.DATABASE_URI;
  if (!MASTER_URI) {
    throw new Error('[tenantConfigService] DATABASE_URI is not set. Check vtu-backend/.env.');
  }
  try {
    console.log('[tenantConfigService] Connecting to Master DB…');
    masterConnection = await mongoose.createConnection(MASTER_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
    }).asPromise();
    console.log('[tenantConfigService] Connected to Master DB.');

    const MasterTenantSchema = new mongoose.Schema(
      {
        tenantId:          { type: String, required: true, unique: true },
        dbName:            { type: String, required: true, unique: true },
        paystackSecretKey: { type: String, required: true, select: false },
      },
      { collection: 'tenants' }
    );

    const MasterTenant =
      masterConnection.models.MasterTenant ||
      masterConnection.model('MasterTenant', MasterTenantSchema, 'tenants');

    const tenants = await MasterTenant.find({}).select('+paystackSecretKey').lean();

    if (!tenants.length) {
      console.warn(
        '[tenantConfigService] WARNING: No tenants found in Master DB. ' +
        'Seed at least one tenant document into the "tenants" collection.'
      );
    }

    // Clear and repopulate caches (important for lazy reloads)
    for (const key of Object.keys(tenantSecretsCache)) {
      delete tenantSecretsCache[key];
    }
    for (const key of Object.keys(secretKeyIndex)) {
      delete secretKeyIndex[key];
    }

    for (const tenant of tenants) {
      const config = {
        tenantId:          tenant.tenantId,
        dbName:            tenant.dbName,
        paystackSecretKey: tenant.paystackSecretKey,
      };

      // Primary cache — lookup by tenantId
      tenantSecretsCache[tenant.tenantId] = config;

      // Secondary index — lookup by paystackSecretKey (used by webhook handler)
      secretKeyIndex[tenant.paystackSecretKey] = config;
    }

    console.log(
      `[tenantConfigService] Loaded secrets for ${tenants.length} tenant(s): ` +
      Object.keys(tenantSecretsCache).join(', ')
    );

  } catch (error) {
    console.error('❌ Failed to load tenant secrets:', error.message);

    if (error.name === 'MongooseServerSelectionError') {
      console.error('💡 Most likely cause: MongoDB Atlas IP not whitelisted. Add 0.0.0.0/0 in Network Access.');
    }

    masterConnection = null; // Reset connection on failure
    throw error; // Let the caller handle the fatal error
  }
}

/**
 * Returns the cached config for a tenant by tenantId.
 * @param {string} tenantId
 * @returns {{ tenantId, dbName, paystackSecretKey } | null}
 */
function getTenantSecret(tenantId) {
  return tenantSecretsCache[tenantId] ?? null;
}

/**
 * Returns all tenant configs — used by tenantDbService at startup.
 * @returns {Object.<string, { tenantId, dbName, paystackSecretKey }>}
 */
function getAllTenantSecrets() {
  return { ...tenantSecretsCache };
}

/**
 * Returns all Paystack secret keys — used by webhook handler to find
 * which tenant a webhook belongs to by iterating and verifying HMAC.
 * @returns {string[]}
 */
function getAllSecretKeys() {
  return Object.keys(secretKeyIndex);
}

/**
 * Returns the tenant config associated with a given Paystack secret key.
 * Used by webhook handler after HMAC verification succeeds.
 * @param {string} secretKey
 * @returns {{ tenantId, dbName, paystackSecretKey } | null}
 */
function getTenantConfigBySecretKey(secretKey) {
  return secretKeyIndex[secretKey] ?? null;
}

/**
 * Returns true if the tenant secrets cache is empty (no tenants loaded).
 * Used by tenantDbService to decide whether to attempt a lazy reload.
 */
function isTenantCacheEmpty() {
  return Object.keys(tenantSecretsCache).length === 0;
}

module.exports = {
  loadTenantSecrets,
  getTenantSecret,
  getAllTenantSecrets,
  getAllSecretKeys,
  getTenantConfigBySecretKey,
  getMasterConnection,
  isTenantCacheEmpty,
};