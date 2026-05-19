const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true, unique: true },
  transactionPin: {
    type: String,
    default: null, // Stores the hashed PIN
  },
  isPinSet: {
    type: Boolean,
    default: false,
  },
  password: { type: String, required: true, select: false }, // select: false hides it by default queries
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ✅ CORRECT: src/models/User.js

// Remove 'next' from the parameters completely
UserSchema.pre('save', async function () {
  // If password wasn't modified, just return (Promise resolves)
  if (!this.isModified('password')) return;

  // Hash the password
  this.password = await bcrypt.hash(this.password, 12);
  
  // No need to call next()
});

// Method to check password
UserSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// module.exports = mongoose.model('User', UserSchema);

module.exports = {
    schema: UserSchema,
    modelName: 'User'
};