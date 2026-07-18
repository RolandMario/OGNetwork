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
        // 2. Get Connection from Service (now supports lazy fallback)
        const tenantConnection = await getTenantConnection(sanitizedTenantId);

        // 3. Attach Models to Request
        req.models = tenantConnection.models;
        req.dbConnection = tenantConnection;

        next();
    } catch (error) {
        console.error('Tenant Middleware Error:', error);
        const message = error.message || 'Failed to establish database connection for tenant.';
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            status: 'error',
            message,
            ...(NODE_ENV === 'development' && { error: message })
        });
    }
};

module.exports = tenantMiddleware;