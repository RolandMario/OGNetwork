// src/config/masterDb.js
const mongoose = require('mongoose');
const MasterTenantModel = require('../models/MasterTenant');

// Use a separate connection instance, NOT the global mongoose object
let masterConnection = null;

const connectMasterDb = async () => {
    if (masterConnection) {
        return masterConnection;
    }

    try {
        // Replace with your actual Master DB URL
        const MASTER_DB_URI = process.env.MASTER_DB_URI || 'mongodb://localhost:27017/vtu_master_db';
        
        masterConnection = await mongoose.createConnection(MASTER_DB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // ... standard connection options
        });

        // Attach the MasterTenant model to this specific connection
        masterConnection.model('MasterTenant', MasterTenantModel.schema, 'tenants');
        
        console.log("Master DB connected successfully.");
        return masterConnection;
    } catch (error) {
        console.error("COULD NOT CONNECT TO MASTER DATABASE:", error);
        throw error;
    }
};

module.exports = { connectMasterDb };