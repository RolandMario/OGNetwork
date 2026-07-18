'use strict';

// src/services/notificationService.js
//
// Push notification service using Expo Push Notifications API.
// Stores device tokens per user and sends push notifications
// for transaction updates, funding confirmations, etc.

const https = require('https');

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

// In-memory token store (in production, store in DB)
// Structure: { [userId]: [token1, token2, ...] }
const deviceTokens = new Map();

// ---------------------------------------------------------------------------
// Register a device push token for a user
// ---------------------------------------------------------------------------
function registerDeviceToken(userId, token) {
  if (!userId || !token) return false;
  
  if (!deviceTokens.has(userId)) {
    deviceTokens.set(userId, []);
  }
  
  const tokens = deviceTokens.get(userId);
  if (!tokens.includes(token)) {
    tokens.push(token);
  }
  
  return true;
}

// ---------------------------------------------------------------------------
// Unregister a device push token
// ---------------------------------------------------------------------------
function unregisterDeviceToken(userId, token) {
  if (!userId || !deviceTokens.has(userId)) return false;
  
  const tokens = deviceTokens.get(userId);
  const index = tokens.indexOf(token);
  if (index > -1) {
    tokens.splice(index, 1);
    if (tokens.length === 0) {
      deviceTokens.delete(userId);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Get all tokens for a user
// ---------------------------------------------------------------------------
function getUserTokens(userId) {
  return deviceTokens.get(userId) || [];
}

// ---------------------------------------------------------------------------
// Send push notification to a single user
// ---------------------------------------------------------------------------
async function sendPushNotification(userId, { title, body, data = {} }) {
  const tokens = getUserTokens(userId);
  if (tokens.length === 0) {
    console.log(`[Notification] No device tokens for user ${userId}`);
    return { sent: false, reason: 'no_tokens' };
  }

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
  }));

  try {
    const results = await sendToExpo(messages);
    console.log(`[Notification] Sent ${messages.length} notification(s) to user ${userId}`);
    return { sent: true, results };
  } catch (error) {
    console.error(`[Notification] Failed to send to user ${userId}:`, error.message);
    return { sent: false, reason: error.message };
  }
}

// ---------------------------------------------------------------------------
// Send push notification for transaction status update
// ---------------------------------------------------------------------------
async function sendTransactionNotification(userId, { type, status, amount, reference }) {
  const statusEmoji = status === 'SUCCESS' ? '✅' : status === 'FAILED' ? '❌' : '⏳';
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  
  let title, body;
  
  if (status === 'SUCCESS') {
    title = `${statusEmoji} ${typeLabel} Successful`;
    body = `Your ${typeLabel.toLowerCase()} of ₦${(amount / 100).toLocaleString()} was successful.`;
  } else if (status === 'FAILED') {
    title = `${statusEmoji} ${typeLabel} Failed`;
    body = `Your ${typeLabel.toLowerCase()} of ₦${(amount / 100).toLocaleString()} failed. Please try again.`;
  } else {
    title = `⏳ ${typeLabel} Processing`;
    body = `Your ${typeLabel.toLowerCase()} of ₦${(amount / 100).toLocaleString()} is being processed.`;
  }

  return sendPushNotification(userId, {
    title,
    body,
    data: {
      type: 'transaction_update',
      transactionType: type,
      status,
      amount,
      reference,
    },
  });
}

// ---------------------------------------------------------------------------
// Send push notification for wallet funding
// ---------------------------------------------------------------------------
async function sendFundingNotification(userId, { amount, newBalance, reference }) {
  return sendPushNotification(userId, {
    title: '💰 Wallet Funded',
    body: `₦${(amount / 100).toLocaleString()} has been added to your wallet. New balance: ₦${(newBalance / 100).toLocaleString()}.`,
    data: {
      type: 'wallet_funding',
      amount,
      newBalance,
      reference,
    },
  });
}

// ---------------------------------------------------------------------------
// Send push notification for low balance warning
// ---------------------------------------------------------------------------
async function sendLowBalanceNotification(userId, balance) {
  return sendPushNotification(userId, {
    title: '⚠️ Low Wallet Balance',
    body: `Your wallet balance is ₦${(balance / 100).toLocaleString()}. Please fund your wallet to continue using our services.`,
    data: {
      type: 'low_balance',
      balance,
    },
  });
}

// ---------------------------------------------------------------------------
// Internal: Send messages to Expo Push API
// ---------------------------------------------------------------------------
function sendToExpo(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(messages);
    
    const options = {
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`[Notification] Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  registerDeviceToken,
  unregisterDeviceToken,
  getUserTokens,
  sendPushNotification,
  sendTransactionNotification,
  sendFundingNotification,
  sendLowBalanceNotification,
};