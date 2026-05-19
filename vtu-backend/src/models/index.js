// Import all your schema files here.
// IMPORTANT: Your model files (User.js, Wallet.js) should export the SCHEMA, not the compiled model.
// See note below this code block.

const userSchema = require('./User').schema; // Assuming User.js exports { schema: UserSchema }
const walletSchema = require('./Wallet').schema;
const transactionSchema = require('./Transaction').schema;
// Add other schemas here...

module.exports = {
    User: userSchema,
    Wallet: walletSchema,
    Transaction: transactionSchema,
    // Add others...
};