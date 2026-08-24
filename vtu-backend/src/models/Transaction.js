const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['FUNDING', 'AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'MANUAL_FUNDING', 'COMMISSION', 'COMMISSION_WITHDRAWAL'], 
    required: true 
  },
  amount: { type: Number, required: true }, // In base unit (Kobo)
  
  // Status flow: PENDING -> SUCCESS or FAILED
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'REVERSED'], default: 'PENDING' },

  // Profit amount in kobo (ourPrice - providerPrice for data/cable, surcharge for electricity, % for airtime)
  profit: { type: Number, default: 0 },
  
  // Details about the service (e.g., phone number topped up)
  // NOTE: stored as Mixed so every per-service receipt field persists. The
  // previous narrow sub-schema silently dropped undeclared keys (planName,
  // plan_name, userLevel, meterType, token, failureReason, ...), which meant
  // receipts/history could not show the data plan size that buyData stores.
  details: {
    type:    mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Admin note for manual wallet operations
  note: { type: String, default: '' },

  // References for reconciliation
  transactionReference: { type: String, unique: true, required: true }, // Internal unique Ref
  paymentGatewayRef: String, // Reference from Paystack/Monnify (for funding)
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