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

async function loadTenantSecrets() {
  const MASTER_URI = process.env.DATABASE_URI;
  if (!MASTER_URI) {
    throw new Error('[tenantConfigService] DATABASE_URI is not set. Check vtu-backend/.env.');
  }

  masterConnection = await mongoose.createConnection(MASTER_URI).asPromise();
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

module.exports = {
  loadTenantSecrets,
  getTenantSecret,
  getAllTenantSecrets,
  getAllSecretKeys,
  getTenantConfigBySecretKey,
  getMasterConnection,
};