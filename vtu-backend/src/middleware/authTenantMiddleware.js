const { getTenantConnection } = require('../services/tenantDbService');

/**
 * Flexible middleware for auth routes (login, register)
 * Accepts tenant ID from:
 * 1. x-tenant-id header
 * 2. tenantId query parameter (?tenantId=xyz)
 * 3. tenantId in request body
 * 4. Defaults to 'default' for development
 */
const authTenantMiddleware = async (req, res, next) => {
    try {
        // 1. Try to get tenant ID from multiple sources
        let tenantId = req.headers['x-tenant-id'] 
            || req.query.tenantId 
            || req.body?.tenantId 
            || 'default'; // Default tenant for development

        // Sanitize tenant ID to prevent database injection attacks
        const sanitizedTenantId = tenantId.replace(/[^a-z0-9]/gi, '').toLowerCase();

        if (!sanitizedTenantId || sanitizedTenantId.length < 3) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Invalid tenant ID format. Must be at least 3 alphanumeric characters.' 
            });
        }

        console.log(`[authTenantMiddleware] Connecting to tenant: ${sanitizedTenantId}`);

        // 2. Get tenant connection (now supports lazy fallback)
        const tenantConnection = await getTenantConnection(sanitizedTenantId);

        // 3. Attach models and connection to request
        req.models = tenantConnection.models;
        req.dbConnection = tenantConnection;
        req.tenantId = sanitizedTenantId;

        next();
    } catch (error) {
        console.error('[authTenantMiddleware] Error:', error.message);
        const message = error.message || 'Failed to establish database connection for tenant.';
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            status: 'error',
            message,
            ...(process.env.NODE_ENV === 'development' && { error: message })
        });
    }
};

module.exports = authTenantMiddleware;
