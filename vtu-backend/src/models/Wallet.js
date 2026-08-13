const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Wallet balance cannot be negative'] // Critical safety check
  },
  // Commission wallet — holds the user's earned commissions (in base unit / kobo).
  // These sit separately from the main balance until the user withdraws them to
  // the main wallet (see commissionController.withdrawCommission).
  commissionBalance: {
    type: Number,
    default: 0,
    min: [0, 'Commission balance cannot be negative'],
  },
  currency: { type: String, default: 'NGN' },
  // Optional: Add bonusBalance, referralBalance here
}, { timestamps: true });



module.exports = {
    schema: WalletSchema,
    modelName: 'Wallet'
};