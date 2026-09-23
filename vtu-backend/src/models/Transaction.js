const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['FUNDING', 'AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'MANUAL_FUNDING', 'COMMISSION', 'COMMISSION_WITHDRAWAL'], 
    required: true 
  },
  amount: { type: Number, required: true }, // In base unit (Kobo)
  
  // Status flow: PENDING -> SUCCESS | FAILED | UNCONFIRMED
  //  - PENDING      — wallet debited, provider call in flight
  //  - SUCCESS      — provider confirmed the order (service delivered)
  //  - FAILED       — provider DEFINITIVELY rejected the order (auto-refunded)
  //  - UNCONFIRMED  — provider outcome UNKNOWN (timeout / network failure / 5xx).
  //                   The wallet debit is PRESERVED until an admin reconciles:
  //                   the order may have been delivered even though we never
  //                   got a successful response. NEVER auto-refund this state.
  //  - REVERSED     — legacy status (see reverseAndFail; kept for history)
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'UNCONFIRMED', 'REVERSED'], default: 'PENDING' },

  // Why the transaction did not complete normally. Populated when a purchase
  // fails (details also carry `failureReason` for backward compat with the
  // existing receipt/history UIs) — and always set when a transaction is
  // marked UNCONFIRMED so the reconciliation queue shows the exact provider
  // error that made the outcome ambiguous.
  failureReason: { type: String, default: '' },

  // Reconciliation audit trail — set when an admin manually resolves an
  // UNCONFIRMED transaction via the admin console.
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  resolutionNote: { type: String, default: '' },

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