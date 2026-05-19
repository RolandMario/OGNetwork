const { getTenantConnection } = require('../services/tenantDbService');

/**
 * Middleware to resolve tenant DB connection based on header.
 * Expects header: 'x-tenant-id'
 */
const tenantMiddleware = async (req, res, next) => {
    // 1. Identify Tenant
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing x-tenant-id header. Cannot identify tenant context.'
        });
    }

    // Sanitize tenant ID to prevent database injection attacks via DB name
    // Only allow alphanumeric characters.
    const sanitizedTenantId = tenantId.replace(/[^a-z0-9]/gi, '').toLowerCase();

    if (!sanitizedTenantId || sanitizedTenantId.length < 3) {
         return res.status(400).json({ status: 'error', message: 'Invalid tenant ID format.' });
    }

    try {
        console.log('trying to connect to the DB')
        // 2. Get Connection from Service
        const tenantConnection = await getTenantConnection(sanitizedTenantId);
         console.log(' DB connection successfull')


         // CRITICAL LOGGING:
    console.log('Middleware Connection Status:', tenantConnection.readyState); 
    console.log('Models Attached:', Object.keys(tenantConnection.models));
        // 3. Attach Models to Request
        // The connection object already has the models compiled onto it in the service.
        // We make them easily accessible to controllers.
        req.models = tenantConnection.models;
        req.dbConnection = tenantConnection; // Optional: attach raw connection if needed

            console.log('tenantmiddleware executed')
        next();
    } catch (error) {
        console.error('Tenant Middleware Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to establish database connection for tenant.'
        });
    }
};

module.exports = tenantMiddleware;