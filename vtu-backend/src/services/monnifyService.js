'use strict';

// src/services/monnifyService.js
//
// Handles all outbound communication with the Monnify API.
// Monnify uses OAuth2 — we obtain a bearer token using API Key + Secret Key.

const https = require('https');
const crypto = require('crypto');

// Monnify environment variables (from .env)
const MONIFY_API_KEY = process.env.MONIFY_API_KEY;
const MONIFY_SECRET_KEY = process.env.MONIFY_SECRET_KEY;
const MONIFY_CONTRACT_CODE = process.env.MONIFY_CONTRACT_CODE;
const MONIFY_BASE_URL = process.env.MONIFY_BASE_URL || 'https://api.monnify.com';

// In-memory token cache
let tokenCache = {
  accessToken: null,
  expiresAt: 0, // epoch ms
};

/**
 * Makes an HTTPS request to the Monnify API.
 *
 * @param {'GET'|'POST'} method
 * @param {string} path  - e.g. '/api/v1/merchant/transactions/init-transaction'
 * @param {object|null} body
 * @param {string|null} token - Bearer token for authenticated requests
 * @returns {Promise<object>} parsed JSON response
 */
function monnifyRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const hostname = new URL(MONIFY_BASE_URL).hostname;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname,
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Monnify wraps responses in { requestSuccessful, responseMessage, responseBody }
          if (!parsed.requestSuccessful) {
            const err = new Error(parsed.responseMessage || 'Monnify request failed');
            err.monnifyResponse = parsed;
            reject(err);
          } else {
            resolve(parsed.responseBody);
          }
        } catch (e) {
          reject(new Error(`Monnify response parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Obtains a Monnify access token using Basic Auth (API Key + Secret Key).
 * Caches the token until it expires.
 *
 * @returns {Promise<string>} access token
 */
async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 300000) {
    return tokenCache.accessToken;
  }

  const hostname = new URL(MONIFY_BASE_URL).hostname;
  const authString = Buffer.from(`${MONIFY_API_KEY}:${MONIFY_SECRET_KEY}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port: 443,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.requestSuccessful) {
            reject(new Error(parsed.responseMessage || 'Monnify auth failed'));
          } else {
            const { accessToken, expiresIn } = parsed.responseBody;
            tokenCache.accessToken = accessToken;
            tokenCache.expiresAt = Date.now() + (expiresIn * 1000);
            resolve(accessToken);
          }
        } catch (e) {
          reject(new Error(`Monnify auth parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Initialises a Monnify payment transaction and returns the checkout URL.
 *
 * @param {object} params
 * @param {string} params.amount       - amount in Naira (e.g. '5000')
 * @param {string} params.reference    - unique transaction reference
 * @param {string} params.customerName - customer's full name
 * @param {string} params.customerEmail
 * @param {string} params.callbackUrl  - URL to redirect after payment
 * @returns {Promise<{ checkoutUrl: string, transactionReference: string }>}
 */
async function initializeTransaction({ amount, reference, customerName, customerEmail, callbackUrl }) {
  const token = await getAccessToken();

  const body = {
    amount,
    customerName,
    customerEmail,
    paymentReference: reference,
    paymentDescription: 'Wallet Funding',
    currencyCode: 'NGN',
    contractCode: MONIFY_CONTRACT_CODE,
    redirectUrl: callbackUrl,
    paymentMethods: ['CARD', 'ACCOUNT_TRANSFER', 'USSD'], // Available channels
  };

  const response = await monnifyRequest(
    'POST',
    '/api/v1/merchant/transactions/init-transaction',
    body,
    token
  );

  return {
    checkoutUrl: response.checkoutUrl,
    transactionReference: response.transactionReference,
  };
}

/**
 * Verifies a Monnify transaction by transaction reference.
 *
 * @param {string} transactionReference - Monnify's transaction reference
 * @returns {Promise<object>} transaction data including payment status
 */
async function verifyTransaction(transactionReference) {
  const token = await getAccessToken();
  const response = await monnifyRequest(
    'GET',
    `/api/v1/merchant/transactions/query/${transactionReference}`,
    null,
    token
  );

  return {
    amount: response.amount,
    paidAmount: response.paidAmount,
    paymentStatus: response.paymentStatus, // 'PAID' or 'OVERPAID' or 'PARTIALLY_PAID' or 'FAILED'
    transactionReference: response.transactionReference,
    paymentReference: response.paymentReference,
    completedOn: response.completedOn,
    paidOn: response.paidOn,
    customerEmail: response.customerEmail,
    customerName: response.customerName,
    settlementAmount: response.settlementAmount,
    paymentMethod: response.paymentMethod,
  };
}

/**
 * Verifies a Monnify webhook signature.
 * Monnify signs webhooks with a hash computed as:
 *   sha512( requestBody + clientSecretKey )
 *
 * @param {string} body        - raw request body as string
 * @param {string} signature   - value of the 'monnify-signature' header
 * @returns {boolean} true if signature is valid
 */
function verifyWebhookSignature(body, signature) {
  const hash = crypto
    .createHmac('sha512', MONIFY_SECRET_KEY)
    .update(body)
    .digest('hex');
  return hash === signature;
}

/**
 * Generates a unique transaction reference.
 * Format: OGN-MON-<timestamp>-<6 random hex chars>
 *
 * @returns {string}
 */
function generateReference() {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `OGN-MON-${Date.now()}-${rand}`;
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  generateReference,
  getAccessToken,
};