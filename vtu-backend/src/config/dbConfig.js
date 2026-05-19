require('dotenv').config();

module.exports = {
  // The base connection string WITHOUT the database name.
  // Example in .env: MONGODB_BASE_URI=mongodb+srv://user:pass@cluster0.xyz.mongodb.net/?retryWrites=true&w=majority
  baseUri: process.env.MONGODB_BASE_URI,

  options: {
    // Mongoose connection options needed for dynamic connections
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
    // Important: Connection pool size per tenant.
    // Don't set this too high, or you'll exhaust Mongo max connections rapidly with many tenants.
    maxPoolSize: 10, 
    serverSelectionTimeoutMS: 15000, // Keep timeout short for faster failure detection
    autoIndex: process.env.NODE_ENV !== 'production', // Don't auto-build indexes in prod usually
  },
};