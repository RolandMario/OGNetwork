const mongoose = require('mongoose');
const dbConfig = require('../config/dbConfig');
const schemas = require('../models/index'); // Import the schema registry from Step 2

// Cache to hold active tenant connections.
// Key: tenantIdString, Value: Mongoose Connection Object
const connectionCache = new Map();

/**
 * Gets an existing connection or creates a new one for a specific tenant ID.
 * @param {string} tenantId - The unique identifier for the tenant (used as DB name)
 * @returns {Promise<mongoose.Connection>}
 */
const getTenantConnection = async (tenantId) => {
    // 1. Check cache first
    if (connectionCache.has(tenantId)) {
        const conn = connectionCache.get(tenantId);
        // Ensure connection is healthy (readyState 1 = connected, 2 = connecting)
        if (conn.readyState === 1 || conn.readyState === 2) {
            return conn;
        }
        // If not healthy, remove from cache and reconnect below
        console.log(`[Tenant DB] Connection unhealthy for ${tenantId}, reconnecting...`);
        connectionCache.delete(tenantId);
    }

    // 2. Construct Tenant-Specific URI
    // e.g., mongodb+srv://...?retryWrites=true&w=majority becomes
    //       mongodb+srv://.../tenant_123?retryWrites=true&w=majority
    const tenantDbName = `vtu_tenant_${tenantId}`;
    const uriParts = dbConfig.baseUri.split('?');
    const tenantUri = `${uriParts[0]}${tenantDbName}?${uriParts[1] || ''}`;

    // 3. Create NEW connection instance (crucial: do NOT use mongoose.connect)
    try {
        console.log(`[Tenant DB] Creating new connection pool for: ${tenantDbName}`);
        const conn = await mongoose.createConnection(tenantUri).asPromise();

        // 4. Attach Models to this specific connection instance
        // We iterate through our schema registry and compile them onto this connection.
        Object.keys(schemas).forEach((modelKey) => {
             const schemaObj = schemas[modelKey];
             // Check if model already compiled on this connection to avoid errors
             if (!conn.models[modelKey]) {
                 conn.model(modelKey, schemaObj);
             }
        });

        // 5. Handle connection events for robustness
        conn.on('error', (err) => {
            console.error(`[Tenant DB Error] ${tenantId}:`, err);
            connectionCache.delete(tenantId); // Clear from cache on error
        });
        conn.on('disconnected', () => {
            console.log(`[Tenant DB Disconnected] ${tenantId}`);
            connectionCache.delete(tenantId);
        });

        // 6. Save to cache and return
        connectionCache.set(tenantId, conn);
        return conn;

    } catch (error) {
        console.error(`[Tenant DB] Failed to connect to ${tenantDbName}`, error);
        throw error;
    }
};


const { connectMasterDb } = require('../config/masterDb'); // To get the list of tenants

// A map to store all established tenant connections (Mongoose Connection objects)
const tenantConnections = {};

/**
 * @desc Retrieves a specific Mongoose Connection object by tenantId.
 * @param {string} tenantId - The unique identifier for the tenant.
 * @returns {mongoose.Connection|null}
 */
const getConnectionByTenantId = (tenantId) => {
    return tenantConnections[tenantId] || null;
};

/**
 * @desc Creates and stores a Mongoose connection for a single tenant.
 * @param {string} tenantId - The unique identifier for the tenant (e.g., 'clientA').
 * @param {string} dbName - The database name to connect to (e.g., 'vtu_tenant_clientA_db').
 * @returns {Promise<mongoose.Connection>} The established connection object.
 */
const createTenantConnection = async (tenantId, dbName) => {
    // Check if connection already exists
    if (tenantConnections[tenantId] && tenantConnections[tenantId].readyState === 1) {
        console.log(`Tenant DB connection already active for: ${tenantId}`);
        return tenantConnections[tenantId];
    }

    try {
        // Construct the specific database URI
        // Note: Assumes the base URI is stored in an environment variable (e.g., MONGODB_BASE_URI)
        const MONGODB_BASE_URI = process.env.MONGODB_BASE_URI || 'mongodb://localhost:27017/';
        const dbUri = MONGODB_BASE_URI + dbName;

        const tenantConn = await mongoose.createConnection(dbUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // You may need to remove these if using an older Mongoose version, but they are standard:
            // useNewUrlParser: true, 
            // useUnifiedTopology: true,
        });

        // Attach models to this specific connection instance
        // This is crucial for multi-tenancy: each connection needs its own set of models
        tenantConn.model('User', require('../models/User').schema);
        tenantConn.model('Wallet', require('../models/Wallet').schema);
        tenantConn.model('Transaction', require('../models/Transaction').schema);
        
        // Store the successful connection
        tenantConnections[tenantId] = tenantConn;
        console.log(`Tenant DB connected: ${tenantId} (${dbName})`);

        return tenantConn;
    } catch (error) {
        console.error(`ERROR: Could not connect to tenant DB ${dbName} for ${tenantId}:`, error.message);
        throw new Error(`Failed to connect tenant DB: ${dbName}`);
    }
};

/**
 * @desc CORE FUNCTION: Fetches all tenants from the Master DB and connects to each one.
 * @returns {Promise<void>}
 */
const connectAllTenantDbs = async () => {
    try {
        const masterDb = await connectMasterDb();
        // Get the MasterTenant model from the master connection instance
        const MasterTenant = masterDb.model('MasterTenant'); 

        // 1. Fetch all tenants from the Master DB
        const tenants = await MasterTenant.find({}).select('tenantId dbName');

        if (tenants.length === 0) {
            console.warn("No tenants found in the Master DB to connect to.");
            return;
        }

        const connectionPromises = tenants.map(tenant => 
            createTenantConnection(tenant.tenantId, tenant.dbName)
        );

        // 2. Execute all connections concurrently
        await Promise.all(connectionPromises);

        console.log(`\n✅ SUCCESSFULLY connected to ${tenants.length} tenant databases.\n`);

    } catch (error) {
        console.error("FATAL ERROR during connectAllTenantDbs execution:", error.message);
        throw error; // Re-throw to crash the server if this critical step fails
    }
};

/**
 * @desc Close all active tenant connections. Used during server shutdown.
 */
const closeAllTenantConnections = async () => {
    const closePromises = Object.values(tenantConnections).map(conn => {
        if (conn && conn.readyState === 1) { // Check if connection exists and is open
            return conn.close();
        }
        return Promise.resolve();
    });

    await Promise.all(closePromises);
    console.log("All tenant connections closed.");
};


module.exports = {
    connectAllTenantDbs, // <-- Exported for server.js
    getConnectionByTenantId, // <-- Exported for webhook and standard middleware
    closeAllTenantConnections, // <-- Exported for shutdown handler
    createTenantConnection, // Helper, useful for testing
    getTenantConnection
};

