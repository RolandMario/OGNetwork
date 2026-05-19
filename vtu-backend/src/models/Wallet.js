const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Wallet balance cannot be negative'] // Critical safety check
  },
  currency: { type: String, default: 'NGN' },
  // Optional: Add bonusBalance, referralBalance here
}, { timestamps: true });



module.exports = {
    schema: WalletSchema,
    modelName: 'Wallet'
};