// src/controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
// --- Helper Function used to filter req.body ---
// Only allows specific keys to pass through.
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) {
      newObj[el] = obj[el];
    }
  });
  return newObj;
};

// ... other user controllers like getMyTransactionHistory ...

/**
 * @desc    Update current user profile details (Name, Phone, etc.)
 * @route   PATCH /api/v1/user/profile/update
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  try {
    // 1. Create error if user POSTs password data here
    if (req.body.password || req.body.passwordConfirm) {
      return res.status(400).json({
          status: 'fail',
          message: 'This route is not for password updates. Please use /update-password.'
      });
    }

    // 2. Filter out unwanted field names that are not allowed to be updated
    // CRITICAL SECURITY STEP: Only allow specific fields.
    // Do NOT allow 'role', 'balance', 'wallet', etc.
    const filteredBody = filterObj(req.body, 'fullName', 'phone');
    // Note: If you allow email updates, you need to handle email verification again.
    // For simplicity in fintech, changing email/phone often requires a separate, stricter process.
    // If you add 'email' to filterObj, handle duplicate email errors below.

    // 3. Update user document
    const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
      new: true, // Return the updated object instead of the old one
      runValidators: true, // Ensure mongoose validations (e.g. required fields, formats) run
    });

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    // Handle duplicate key error (e.g., trying to change phone to one that exists)
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(400).json({
            status: 'fail',
            message: `An account with that ${field} already exists.`
        });
    }

    res.status(500).json({
      status: 'error',
      message: error.message || 'Could not update profile'
    });
  }
};



// src/controllers/userController.js
const { findUserById } = require('../services/userService');

/**
 * @desc Get user profile and wallet balance for the authenticated user.
 * @route GET /api/v1/user/profile
 * @access Private (Requires AuthMiddleware and TenantMiddleware)
 */
exports.getDashboardData = async (req, res, next) => {
    try {
        // tenantConnection and models are added to req by the tenantMiddleware
        const tenantConnection = req.tenantConnection; 
        const { User, Wallet } = tenantConnection.models; // Access models directly

        // Find the user (using the ID from the Auth token/req.user)
        const user = await User.findById(req.user.id).select('-password');

        // Find the user's wallet
        const wallet = await Wallet.findOne({ user: req.user.id });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.status(200).json({
            success: true,
            user: user,
            wallet: wallet
        });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        next(error); // Pass error to the error handler middleware
    }
};






exports.setTransactionPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const User = req.models.User;

    // 1. Validation: Must be exactly 4 digits
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PIN format. Please provide a 4-digit numeric PIN."
      });
    }

    // 2. Fetch User
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 3. Security Check: Prevent overwriting without "Update PIN" flow
    // If you want users to use the Update flow once a PIN exists
    if (user.isPinSet) {
      return res.status(400).json({
        success: false,
        message: "PIN already set. Use the update PIN option to change it."
      });
    }

    // 4. Hash the PIN
    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(pin, salt);

    // 5. Save to Database
    user.transactionPin = hashedPin;
    user.isPinSet = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Transaction PIN configured successfully."
    });

  } catch (error) {
    console.error("Set PIN Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error occurred while setting PIN."
    });
  }
};




exports.updateTransactionPin = async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;
    const User = req.models.User;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // 1. Verify Old PIN
    const isMatch = await bcrypt.compare(oldPin, user.transactionPin);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "Current PIN is incorrect." 
      });
    }

    // 2. Validate New PIN Format
    if (!/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ 
        success: false, 
        message: "New PIN must be 4 digits." 
      });
    }

    // 3. Hash and Save New PIN
    const salt = await bcrypt.genSalt(10);
    user.transactionPin = await bcrypt.hash(newPin, salt);
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "PIN updated successfully" 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
