const crypto = require('crypto');

/**
 * Generates a unique transaction reference
 * Format: PREFIX-YYYYMMDDHHMM-RANDOM
 * Example: DATA-202512201345-A7B2
 */
exports.generateRequestId = (prefix = 'TRX') => {
  // 1. Get current date components
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');

  const dateString = `${year}${month}${day}${hour}${minute}`;

  // 2. Generate 4 random alphanumeric characters
  // We use crypto for better randomness than Math.random()
  const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();

  return `${prefix}-${dateString}-${randomStr}`;
};