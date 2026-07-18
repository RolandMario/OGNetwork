const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['FUNDING', 'AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'], required: true },
  amount: { type: Number, required: true }, // In base unit (Kobo)
  
  // Status flow: PENDING -> SUCCESS or FAILED
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'REVERSED'], default: 'PENDING' },

  // Profit amount in kobo (ourPrice - providerPrice for data/cable, surcharge for electricity, % for airtime)
  profit: { type: Number, default: 0 },
  
  // Details about the service (e.g., phone number topped up)
  details: {
    beneficiary: String, // Phone number or meter number
    network: String,     // MTN, Airtel
    planId: String       // Data plan ID if applicable
  },

  // References for reconciliation
  transactionReference: { type: String, unique: true, required: true }, // Internal unique Ref
  paymentGatewayRef: String, // Reference from Paystack/Flutterwave (for funding)
  providerRef: String,       // Reference from the VTU API provider (for purchases)
  
  previousBalance: Number,
  newBalance: Number,
}, { timestamps: { createdAt: true, updatedAt: true } });

// Index for quick searching by admin or user history
TransactionSchema.index({ user: 1, status: 1, createdAt: -1 });



module.exports = {
    schema: TransactionSchema,
    modelName: 'Transaction'
};