// src/models/MasterTenant.js
const mongoose = require('mongoose');

const MasterTenantSchema = new mongoose.Schema({
    tenantId: {
        type: String,
        required: true,
        unique: true
    },
    dbName: {
        type: String,
        required: true,
        unique: true // e.g., 'vtu_tenant_clientA'
    },
    paystackSecretKey: { // The key Paystack uses to sign webhooks
        type: String,
        required: true,
        select: false // NEVER return this field in API responses
    },
    // Add other keys like Flutterwave secret, API keys, etc.
});

module.exports = mongoose.model('MasterTenant', MasterTenantSchema, 'tenants');