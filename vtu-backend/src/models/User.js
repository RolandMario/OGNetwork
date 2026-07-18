const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true, unique: true },

  transactionPin: {
    type: String,
    default: null,
  },
  isPinSet: {
    type: Boolean,
    default: false,
  },

  password: { type: String, required: true, select: false },

  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  isActive: { type: Boolean, default: true },

  // ---------------------------------------------------------------------------
  // Paystack Dedicated Virtual Account (DVA)
  // ---------------------------------------------------------------------------

  // Paystack customer code — e.g. 'CUS_xxxxxxxxxxxx'
  // Needed to look up / manage the customer on Paystack's side
  paystackCustomerCode: {
    type: String,
    default: null,
    select: false, // internal use only — not needed in most API responses
  },

  // The dedicated virtual account assigned to this user.
  // Users transfer money to this account to fund their wallet.
  dedicatedAccount: {
    accountNumber: { type: String, default: null },
    accountName:   { type: String, default: null },
    bankName:      { type: String, default: null },
    bankId:        { type: Number, default: null },
    bankSlug:      { type: String, default: null },
    active:        { type: Boolean, default: false },
    // Raw Paystack DVA id — needed if you ever need to deactivate/reassign
    paystackAccountId: { type: Number, default: null, select: false },
  },

}, { timestamps: true });

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = {
  schema: UserSchema,
  modelName: 'User'
};