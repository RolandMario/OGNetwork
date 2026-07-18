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
        const MASTER_DB_URI = process.env.DATABASE_URI || "mongodb+srv://RolandMario:gzS5dvin2g8MQThj@cluster-vtu.mx2yyag.mongodb.net/?appName=Cluster-vtu";
        
        // masterConnection = await mongoose.createConnection(MASTER_DB_URI, {
        //     serverSelectionTimeoutMS: 5000,
        //     socketTimeoutMS: 45000,
        //     // ... standard connection options
        // });


        const masterConnection = await mongoose.createConnection(MASTER_DB_URI, {
            serverSelectionTimeoutMS: 30000,     // Was 10000
            socketTimeoutMS: 60000,
            connectTimeoutMS: 30000,
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 10,
            minPoolSize: 2,
            // DNS & Atlas specific
            family: 4,                           // Force IPv4 (helps on some networks)
        }).asPromise();

// console.log('✅ Master DB connected successfully');

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