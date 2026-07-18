'use strict';

// src/middleware/restrictAdmin.js

/**
 * Middleware to ensure user has admin role
 * Must be used AFTER authMiddleware.protect so req.user is set
 */
const restrictAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status:  'fail',
      message: 'Not authenticated.',
    });
  }

  // Check if user has admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status:  'fail',
      message: 'You do not have permission to access this resource. Admin access required.',
    });
  }

  next();
};

module.exports = restrictAdmin;