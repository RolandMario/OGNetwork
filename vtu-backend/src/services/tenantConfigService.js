// src/services/tenantConfigService.js
const { connectMasterDb } = require('../config/masterDb');

// In-memory cache for fast lookup: { 'secretKey': { tenantId: 'clientA', ... } }
const SECRET_KEY_CACHE = {};
const SECRET_KEY_MAP = {}; // To map tenantId to secretKey for reverse lookup

/**
 * @desc Fetches all tenant payment configurations from the Master DB and populates the cache.
 */
const loadTenantSecrets = async () => {
    try {
        const masterDb = await connectMasterDb();
        const MasterTenant = masterDb.model('MasterTenant');

        // Note the use of .select('+paystackSecretKey') to retrieve the hidden field
        const tenants = await MasterTenant.find({}).select('tenantId +paystackSecretKey');
        // src/services/tenantConfigService.js (inside loadTenantSecrets)



        tenants.forEach(tenant => {
            const secretKey = tenant.paystackSecretKey;
            const tenantId = tenant.tenantId;
            
            // Populate the cache keyed by the secret key (for fast webhook lookups)
            SECRET_KEY_CACHE[secretKey] = {
                tenantId: tenantId,
                // Add any other necessary config here
            };
            
            SECRET_KEY_MAP[tenantId] = secretKey; // For API key fetching if needed
        });
        
        console.log(`Successfully loaded secrets for ${tenants.length} tenants.`);
    } catch (error) {
        console.error("Failed to load tenant secrets:", error);
        // Depending on importance, you might want to exit the app if this fails
    }
};

/**
 * @desc Finds a tenant's config by matching the incoming secret key hash.
 * @param {string} secretKey - The key to look up in the cache.
 * @returns {object|null} The tenant configuration object.
 */
const getTenantConfigBySecretKey = (secretKey) => {
    return SECRET_KEY_CACHE[secretKey] || null;
};

/**
 * @desc Retrieves all known secret keys (used for iterating in webhook validation)
 * @returns {string[]} Array of all secret keys currently in the system.
 */
const getAllSecretKeys = () => {
    return Object.keys(SECRET_KEY_CACHE);
};

module.exports = {
    loadTenantSecrets,
    getTenantConfigBySecretKey,
    getAllSecretKeys
};