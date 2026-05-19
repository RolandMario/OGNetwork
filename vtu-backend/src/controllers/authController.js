const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
// const User = require('../models/User');
// const Wallet = require('../models/Wallet');

// Helper function to generate JWT Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
};

// Helper to send token response
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

/**
 * @desc    Register a new user & create their wallet atomically
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
// exports.register = async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   console.log('auth controller started')

//   try {
//     const { fullName, email, phone, password } = req.body;

//     // 1. Check if user exists
//     const existingUser = await User.findOne({ $or: [{ email }, { phone }] }).session(session);
//     if (existingUser) {
//        await session.abortTransaction();
//        session.endSession();
//        return res.status(400).json({ message: 'Email or Phone already exists' });
//     }
// console.log('new member verified')
//     // 2. Create User
//     // Note: Password hashing happens in the User model pre-save hook
//     const newUser = await User.create([{
//       fullName,
//       email,
//       phone,
//       password,
//     }], { session });
// console.log('User created successfully')
//     // 3. Create Wallet for the new user
//     await Wallet.create([{
//       user: newUser[0]._id,
//       balance: 0, // Always start with 0
//     }], { session });
// console.log('wallet created succefully')
//     // 4. Commit transaction
//     await session.commitTransaction();
//     session.endSession();
// console.log('execution completed')
//     // 5. Send response with token
//     createSendToken(newUser[0], 201, res);
// console.log('user signed')
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     // Pass to global error handler (assuming one exists), or handle here:
//     res.status(500).json({ status: 'error', message: error.message });
//   }
// };


exports.register = async (req, res, next) => {
  // FIX 1: Start session on the specific tenant connection, NOT the global mongoose object
  const session = await req.dbConnection.startSession();

  try {
    let newUser; // Variable to hold the user created inside the transaction scope

    await session.withTransaction(async () => {
      const { fullName, email, phone, password } = req.body;
      const User = req.models.User;
      const Wallet = req.models.Wallet;

      // 1. Check if user exists
      const existingUser = await User.findOne({ $or: [{ email }, { phone }] }).session(session);
      
      if (existingUser) {
        // Create a specific error so we can return 400 instead of 500 later
        const error = new Error('Email or Phone already exists');
        error.statusCode = 400; 
        throw error;
      }

      // 2. Create User
      // Note: Passing { session } ensures this operation is part of the transaction
      const [user] = await User.create([{
        fullName,
        email,
        phone,
        password,
      }], { session });

      // 3. Create Wallet
      await Wallet.create([{
        user: user._id,
        balance: 0,
      }], { session });
      
      // Assign to the outer variable so we can use it after the transaction commits
      newUser = user; 
    });

    // FIX 2: Send response HERE, after the transaction has fully committed.
    // If we send it inside withTransaction, the response might go out even if the commit fails.
    createSendToken(newUser, 201, res);

  } catch (error) {
    console.error("Registration Transaction failed:", error.message);
    
    // FIX 3: Better error handling
    // If we marked the error as 400 (Client Error), send that. Otherwise send 500.
    const statusCode = error.statusCode || 500;
    
    res.status(statusCode).json({ 
        status: 'error', 
        message: error.message || 'Registration failed due to a system error.' 
    });
  } finally {
    // Always end the session to release the connection back to the pool
    session.endSession();
  }
};

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
  try {
    const { emailOrPhone, password } = req.body;
    const User = req.models.User;
    // 1. Check if email/phone and password exist
    if (!emailOrPhone || !password) {
      return res.status(400).json({ message: 'Please provide email/phone and password' });
    }

    // 2. Check if user exists && password is correct
    // We must explicitly select the password field as it's set to select:false in schema
    const user = await User.findOne({
        $or: [{ email: emailOrPhone.toLowerCase() }, { phone: emailOrPhone }]
    }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({ message: 'Incorrect email/phone or password' });
    }

    // 3. If everything ok, send token to client
    createSendToken(user, 200, res);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Get current logged in user data
 * @route   GET /api/v1/auth/me
 * @access  Private (Requires protect middleware)
 */
exports.getMe = async (req, res, next) => {
  try {
    const User = req.models.User;
    // req.user.id comes from the 'protect' middleware
    const user = await User.findById(req.user.id);
    
    // Optional: also fetch wallet balance here if needed often
    // const wallet = await Wallet.findOne({ user: req.user.id });

    res.status(200).json({
      status: 'success',
      data: {
        user,
        // balance: wallet ? wallet.balance / 100 : 0 // Convert back to major unit
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};


// src/controllers/authController.js

// ... keep existing imports (User, Wallet, jwt, bcrypt) ...
// ... keep existing helpers (signToken, createSendToken) ...
// ... keep existing controllers (register, login, getMe) ...


/**
 * @desc    Update current user password
 * @route   PATCH /api/v1/user/update-password (defined in userRoutes.js)
 * @access  Private
 */
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const User = req.models.User;
    // 1. Check if both passwords exist in body
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Please provide your current password and the new password.' });
    }

    // 2. Get current user from database.
    // CRITICAL: We must explicitly select '+password' because it is hidden by default in schema.
    const user = await User.findById(req.user.id).select('+password');

    // 3. Check if current password submitted matches the one in DB
    // Use the helper method defined in the User model
    if (!(await user.correctPassword(currentPassword, user.password))) {
      return res.status(401).json({
          status: 'fail',
          message: 'Your current password is incorrect.'
      });
    }

    // 4. If correct, update password
    user.password = newPassword;

    // 5. Save user document.
    // CRITICAL: This triggers the pre-save hook in User model to hash the new password.
    // Do NOT use findByIdAndUpdate here.
    await user.save();

    // 6. Log user in again so front-end doesn't get logged out (send new token)
    // This is good UX.
    createSendToken(user, 200, res);

  } catch (error) {
      console.error('Password Update Error', error);
      res.status(500).json({
          status: 'error',
          message: 'Could not update password. Please try again.'
      });
  }
};