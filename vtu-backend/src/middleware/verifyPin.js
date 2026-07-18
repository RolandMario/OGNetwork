'use strict';

// src/middleware/verifyPin.js
//
// Middleware that verifies the transaction PIN sent in req.body.pin
// before allowing VTU purchase routes to proceed.
// Must be used AFTER authMiddleware.protect (req.user must be set).

const bcrypt = require('bcryptjs');

const verifyPin = async (req, res, next) => {
  try {
    const { pin } = req.body;
    const User    = req.models.User;

    // 1. PIN must be provided
    if (!pin) {
      return res.status(400).json({
        status:  'fail',
        message: 'Transaction PIN is required.',
      });
    }

    // 2. Fetch user with transactionPin selected
    //    transactionPin has select:false in the schema so we re-select it
    const user = await User.findById(req.user.id).select('+transactionPin +isPinSet');

    if (!user) {
      return res.status(401).json({ status: 'fail', message: 'User not found.' });
    }

    // 3. Check if PIN has been set
    if (!user.isPinSet || !user.transactionPin) {
      return res.status(403).json({
        status:  'fail',
        message: 'Transaction PIN not set. Please set your PIN before making purchases.',
      });
    }

    // 4. Verify PIN
    const isValid = await bcrypt.compare(String(pin), user.transactionPin);
    if (!isValid) {
      return res.status(401).json({
        status:  'fail',
        message: 'Incorrect transaction PIN.',
      });
    }

    // 5. PIN verified — proceed to controller
    next();

  } catch (error) {
    console.error('[verifyPin] Error:', error.message);
    res.status(500).json({ status: 'error', message: 'PIN verification failed.' });
  }
};

module.exports = verifyPin;