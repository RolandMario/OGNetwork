// src/controllers/webhookController.js
const crypto = require('crypto');
const paymentService = require('../services/paymentService');
const mongoose = require('mongoose');
const { getAllSecretKeys, getTenantConfigBySecretKey } = require('../services/tenantConfigService');
const { getTenantConnection } = require('../services/tenantDbService'); // Assume this exists

// **IMPORTANT: Get the Paystack Secret Key and the Tenant Model Map**
// Since webhooks don't go through the tenant middleware, 
// you need a way to look up the correct tenant database connection and models.

// For demonstration, let's assume a simplified way to map keys to tenants.
// In a real app, you'd fetch this from a central configuration DB (Master DB).
// const PAYSTACK_SECRET_MAP = {
//   'test_secret_key_clientA': { tenantId: 'clientA', connection: 'clientA_db_connection_instance' },
//   // ... other tenants
// };
// // You'll also need a function to get the correct Mongoose models for the tenant.
// const { getTenantModels } = require('../services/tenantDbService'); // Assume this exists

// const getTenantBySecret = (secret) => {
//     // In a real system, you query your master database to find the tenant 
//     // whose Paystack secret key matches the one used in the request.
//     const tenantInfo = Object.values(PAYSTACK_SECRET_MAP).find(info => info.secretKey === secret);
//     return tenantInfo;
// };


/**
 * @desc    Handles Paystack event webhooks (Success, Failure, etc.)
 * @route   POST /api/v1/webhooks/paystack
 * @access  Public (Must be verified using signature)
 */
exports.handlePaystackWebhook = async (req, res) => {
    console.log('webhook started')
    // 1. Get the Paystack Signature from the request header
    const hash = req.headers['x-paystack-signature'];


    // --- TEMPORARY DEBUG BLOCK ---
    const rawBodyString = req.body.toString('utf8'); // Convert buffer to string


    // We expect the raw body buffer here (thanks to bodyParser.raw in server.js)
    if (!req.body || !hash) {
        return res.status(400).send('Webhook: Invalid request or missing signature.');
    }
    
    // Convert the raw body buffer back to a JSON object for processing
    let event;
    try {
        // Attempt to parse the raw body buffer received from Paystack
        event = JSON.parse(rawBodyString);
    } catch (e) {
        console.error("Failed to parse Paystack webhook body:", e);
        return res.status(400).send('Webhook: Invalid JSON body.');
    }

    // Determine the tenant connection by finding which secret key matches the hash
    let tenantConfig = null;
    let secretKey = null;

    // **CRITICAL STEP: AUTHENTICATE THE WEBHOOK & FIND THE TENANT**
    const allSecretKeys = getAllSecretKeys();
    
    // Iterate through known tenant secrets to find a match
    for (const key of allSecretKeys) {
        const hmac = crypto.createHmac('sha512', key)
                           .update(req.body)
                           .digest('hex');
                           
        if (hmac === hash) {
            tenantConfig = getTenantConfigBySecretKey(key);
            secretKey = key;
            break;
        }
        console.log(`   HMAC calculated for key ${key.substring(0, 5)}: ${hmac}`); // Optional log
    
    }
console.log('tenantConfig and secret assigned', tenantConfig, secretKey)





    if (!tenantConfig) {
        console.warn("Unauthorized Webhook Attempt: Signature did not match any known tenant.");
        return res.status(401).send('Webhook: Unauthorized signature.');
    }

    // 3. Get the correct connection and models for this tenant
    const tenantConnection = await getTenantConnection(tenantConfig.tenantId);
    if (!tenantConnection) {
        return res.status(500).send('Webhook: Tenant connection not established.');
    }
    console.log('tenant connection established',tenantConnection.models)
    const Transaction = tenantConnection.models.Transaction
    const Wallet = tenantConnection.models.Wallet
    // const { Transaction, Wallet } = tenantConnection.models; // Use models attached to the connection
    if (!Transaction || !Wallet) {
        return res.status(500).send('Webhook: Tenant models not found on connection.');
    }
    console.log('Transaction & Wallet models required')
    // Paystack requires 200 OK immediately to stop retries
   
    
   // src/controllers/webhookController.js (inside handlePaystackWebhook)

// ... (Authentication and Model retrieval code here) ...

// Paystack requires 200 OK immediately to stop retries
// res.status(200).send('Webhook Received'); // <-- HTTP response sent and connection closed.

// -----------------------------------------------------------
// 2. Wrap and Call the Asynchronous Logic to run in the background
// -----------------------------------------------------------

// Check the event type before wrapping (for efficiency)
if (event.event === 'charge.success') {
    // Launch an async IIFE immediately without 'await'
    (async () => {
        const data = event.data;
        const reference = data.reference;
        const amountPaidKobo = data.amount; 
        
        // Ensure you are logging errors in this detached process!
        let session = null;
        try {
            session = await tenantConnection.startSession();
            session.startTransaction();

            // 1. Find the transaction in the tenant DB
            const transaction = await Transaction.findOne({ transactionReference: reference }).session(session);

            if (!transaction) {
                console.warn(`Webhook: Transaction reference ${reference} not found in DB.`);
                await session.abortTransaction();
                return; 
            }
            
            // ... (rest of your transaction logic: Idempotency Check, Amount Check, Wallet Update) ...

            // 4. Update Wallet Balance (Atomic)
            const updatedWallet = await Wallet.findOneAndUpdate(
                 { user: transaction.user }, 
                 { $inc: { balance: amountPaidKobo } },
                 { new: true, session }
            );

            // 5. Update Transaction Status
            transaction.status = 'SUCCESS';
            transaction.paymentGatewayRef = data.id; 
            transaction.newBalance = updatedWallet.balance;
            await transaction.save({ session });

            await session.commitTransaction();
            console.log(`Webhook SUCCESS: Wallet funded for user ${transaction.user}`);
             res.status(200).send('Webhook Received'); 
            
        } catch (err) {
            // Log any errors that happen in the background
            console.error(`Webhook Processing Error for ref ${reference}:`, err);
            // No need to res.status() here, as the response was already sent.
        } finally {
            if (session) session.endSession();
        }
    })(); // The function is called immediately
} 

// The main handlePaystackWebhook function now ends here and returns immediately.
// Any code below this line is unreachable.
    
    // Add logic for other events like 'transfer.success', 'subscription.create', etc.
};