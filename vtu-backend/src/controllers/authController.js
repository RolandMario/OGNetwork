'use strict';

// src/controllers/authController.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const paymentService = require('../services/paymentService');
const { getTenantSecret } = require('../services/tenantConfigService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const signToken = (id) => {
  if (!process.env.JWT_SECRET) {
    console.error('[authController] CRITICAL: JWT_SECRET environment variable is not set!');
    throw new Error('Server configuration error: JWT_SECRET is not set.');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: { user },
  });
};

// ---------------------------------------------------------------------------
// Helper — create Paystack customer + Dedicated Virtual Account
//
// This is BEST-EFFORT and must NEVER block registration.
// If Paystack isn't KYC-verified yet, this silently fails and
// dedicatedAccount.active stays false. The wallet still works via
// the existing initiateFunding (checkout link) flow regardless.
// ---------------------------------------------------------------------------

async function provisionDedicatedAccount({ user, tenantId, User }) {
  try {
    const secretKey = getTenantSecret(tenantId)?.paystackSecretKey;

    if (!secretKey) {
      console.warn(`[DVA] No Paystack secret key for tenant "${tenantId}" — skipping DVA provisioning.`);
      return;
    }

    // Split fullName into first/last for Paystack customer record
    const nameParts = user.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ') || nameParts[0];

    // 1. Create Paystack customer
    const customer = await paymentService.createCustomer({
      email:     user.email,
      firstName,
      lastName,
      phone:     user.phone,
      secretKey,
    });

    console.log(`[DVA] Paystack customer created: ${customer.customerCode} for user ${user._id}`);

    // 2. Create Dedicated Virtual Account for that customer
    const dva = await paymentService.createDedicatedAccount({
      customerCode: customer.customerCode,
      secretKey,
    });

    console.log(`[DVA] Dedicated account assigned: ${dva.accountNumber} (${dva.bankName}) for user ${user._id}`);

    // 3. Persist on user document
    await User.findByIdAndUpdate(user._id, {
      paystackCustomerCode: customer.customerCode,
      dedicatedAccount: {
        accountNumber:     dva.accountNumber,
        accountName:       dva.accountName,
        bankName:          dva.bankName,
        bankId:            dva.bankId,
        bankSlug:          dva.bankSlug,
        active:            true,
        paystackAccountId: dva.accountId,
      },
    });

  } catch (error) {
    // Don't throw — registration must succeed even if DVA provisioning fails.
    // Common cause: business not KYC-verified yet (test mode / pending approval).
    console.warn(
      `[DVA] Provisioning failed for user ${user._id} (non-blocking): ${error.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

/**
 * @desc    Register a new user, create their wallet, and (best-effort)
 *          provision a Paystack Dedicated Virtual Account.
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
exports.register = async (req, res) => {
  const { fullName, email, phone, password } = req.body;
  const User   = req.models.User;
  const Wallet = req.models.Wallet;
  const tenantId = req.headers['x-tenant-id'];

  console.log('=== REGISTRATION DEBUG ===');
  console.log('Tenant ID from header :', tenantId);
  console.log('DB name               :', req.dbConnection?.name ?? 'Unknown');
  console.log('Registering           :', { email, phone });

  let createdUser = null;

  try {
    // 1. Duplicate check
    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email or phone number already registered.',
      });
    }

    // 2. Create user (password hashed by pre-save hook)
    createdUser = await User.create({ fullName, email, phone, password });
    console.log('User saved — _id:', createdUser._id);

    // 3. Create wallet linked to user
    await Wallet.create({ user: createdUser._id, balance: 0 });
    console.log('Wallet saved for user:', createdUser._id);

    // 4. Respond immediately — don't make the user wait for Paystack
    createSendToken(createdUser, 201, res);

    // 5. Provision DVA in the background (best-effort, non-blocking).
    //    The response has already been sent above.
    setImmediate(() => {
      provisionDedicatedAccount({ user: createdUser, tenantId, User });
    });

  } catch (error) {
    console.error('Registration error:', error.message);

    // If user was saved but wallet creation failed, clean up the orphaned user
    // so the client can safely retry without hitting the duplicate-check above.
    if (createdUser) {
      try {
        await User.findByIdAndDelete(createdUser._id);
        console.warn('Rolled back user after wallet creation failure:', createdUser._id);
      } catch (rollbackErr) {
        console.error('Rollback failed — orphaned user:', createdUser._id, rollbackErr.message);
      }
    }

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      message: error.message || 'Registration failed. Please try again.',
    });
  }
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;
    const User = req.models.User;

    if (!emailOrPhone || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email/phone and password.',
      });
    }

    const user = await User.findOne({
      $or: [
        { email: emailOrPhone.toLowerCase() },
        { phone: emailOrPhone },
      ],
    }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email/phone or password.',
      });
    }

    createSendToken(user, 200, res);
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get current user
// ---------------------------------------------------------------------------

/**
 * @desc    Get logged-in user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
exports.getMe = async (req, res) => {
  try {
    const User = req.models.User;
    const user = await User.findById(req.user.id);

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    console.error('getMe error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Update password
// ---------------------------------------------------------------------------

/**
 * @desc    Update password for logged-in user
 * @route   PATCH /api/v1/user/update-password
 * @access  Private
 */
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const User = req.models.User;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide your current password and a new password.',
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.correctPassword(currentPassword, user.password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Your current password is incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();

    createSendToken(user, 200, res);
  } catch (error) {
    console.error('Password update error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Could not update password. Please try again.',
    });
  }
};

// ---------------------------------------------------------------------------
// Retry DVA provisioning
// ---------------------------------------------------------------------------

/**
 * @desc    Manually retry Dedicated Virtual Account provisioning.
 *          Useful if it failed at registration time (e.g. business
 *          wasn't KYC-verified yet) and is now approved.
 * @route   POST /api/v1/user/wallet/provision-account
 * @access  Private
 */
exports.retryProvisionDedicatedAccount = async (req, res) => {
  try {
    const User = req.models.User;
    const tenantId = req.headers['x-tenant-id'];
    const user = await User.findById(req.user.id);

    if (user.dedicatedAccount?.active) {
      return res.status(200).json({
        status:  'success',
        message: 'Dedicated account already provisioned.',
        data: { dedicatedAccount: user.dedicatedAccount },
      });
    }

    await provisionDedicatedAccount({ user, tenantId, User });

    const updated = await User.findById(req.user.id);

    if (!updated.dedicatedAccount?.active) {
      return res.status(422).json({
        status:  'fail',
        message: 'Could not provision dedicated account. Your business may not be KYC-verified on Paystack yet, or this feature is unavailable in test mode.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { dedicatedAccount: updated.dedicatedAccount },
    });

  } catch (error) {
    console.error('retryProvisionDedicatedAccount error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};