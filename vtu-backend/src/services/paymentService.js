'use strict';

// src/services/paymentService.js
//
// Handles all outbound communication with the Paystack API.
// Controllers call this service — never call Paystack directly from controllers.

const https = require('https');
const crypto = require('crypto');

const PAYSTACK_BASE = 'api.paystack.co';

/**
 * Makes an HTTPS request to the Paystack API.
 *
 * @param {'GET'|'POST'} method
 * @param {string} path  - e.g. '/transaction/initialize'
 * @param {object|null} body
 * @param {string} secretKey - tenant-specific Paystack secret key
 * @returns {Promise<object>} parsed JSON response
 */
function paystackRequest(method, path, body, secretKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: PAYSTACK_BASE,
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Paystack response parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Initialises a Paystack transaction and returns the checkout URL.
 *
 * @param {object} params
 * @param {string} params.email          - user's email address
 * @param {number} params.amountKobo     - amount in kobo (e.g. 500000 = ₦5,000)
 * @param {string} params.reference      - unique internal transaction reference
 * @param {string} params.callbackUrl    - URL Paystack redirects to after payment
 * @param {string} params.secretKey      - tenant Paystack secret key
 * @returns {Promise<{ authorizationUrl: string, accessCode: string, reference: string }>}
 */
async function initializeTransaction({ email, amountKobo, reference, callbackUrl, secretKey }) {
  const response = await paystackRequest(
    'POST',
    '/transaction/initialize',
    {
      email,
      amount: amountKobo,
      reference,
      callback_url: callbackUrl,
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    },
    secretKey
  );

  if (!response.status) {
    throw new Error(`Paystack initialization failed: ${response.message}`);
  }

  return {
    authorizationUrl: response.data.authorization_url,
    accessCode:       response.data.access_code,
    reference:        response.data.reference,
  };
}

/**
 * Verifies a Paystack transaction by reference.
 * Use this as a secondary check on the callback URL (not a substitute for webhooks).
 *
 * @param {string} reference
 * @param {string} secretKey
 * @returns {Promise<object>} Paystack transaction data
 */
async function verifyTransaction(reference, secretKey) {
  const response = await paystackRequest(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`,
    null,
    secretKey
  );

  if (!response.status) {
    throw new Error(`Paystack verification failed: ${response.message}`);
  }

  return response.data;
}

/**
 * Generates a unique transaction reference.
 * Format: OGN-<timestamp>-<6 random hex chars>
 *
 * @returns {string}
 */
function generateReference() {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `OGN-${Date.now()}-${rand}`;
}

// ---------------------------------------------------------------------------
// Dedicated Virtual Accounts (DVA)
// ---------------------------------------------------------------------------

/**
 * Creates a Paystack customer.
 * A customer must exist before a Dedicated Virtual Account can be assigned.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} params.phone
 * @param {string} params.secretKey - tenant Paystack secret key
 * @returns {Promise<{ customerCode: string, customerId: number }>}
 */
async function createCustomer({ email, firstName, lastName, phone, secretKey }) {
  const response = await paystackRequest(
    'POST',
    '/customer',
    {
      email,
      first_name: firstName,
      last_name:  lastName,
      phone,
    },
    secretKey
  );

  if (!response.status) {
    // Paystack returns status:false with a message if email already has a customer —
    // in that case, the existing customer is usually returned in response.data anyway.
    throw new Error(`Paystack create customer failed: ${response.message}`);
  }

  return {
    customerCode: response.data.customer_code,
    customerId:   response.data.id,
  };
}

/**
 * Creates a Dedicated Virtual Account (DVA) for a Paystack customer.
 *
 * IMPORTANT: This requires your Paystack business to be KYC-verified.
 * If not verified, Paystack returns status:false with a message like
 * "You cannot create a dedicated account because business is not KYC verified".
 *
 * Default provider is 'wema-bank'. Some businesses get 'titan-paystack'
 * depending on Paystack's allocation — you usually don't need to specify it.
 *
 * @param {object} params
 * @param {string} params.customerCode - Paystack customer_code (e.g. 'CUS_xxxx')
 * @param {string} params.secretKey    - tenant Paystack secret key
 * @param {string} [params.preferredBank] - optional, e.g. 'wema-bank' or 'titan-paystack'
 * @returns {Promise<{ accountNumber, accountName, bankName, bankId, bankSlug, accountId }>}
 */
async function createDedicatedAccount({ customerCode, secretKey, preferredBank }) {
  const body = { customer: customerCode };
  if (preferredBank) body.preferred_bank = preferredBank;

  const response = await paystackRequest(
    'POST',
    '/dedicated_account',
    body,
    secretKey
  );

  if (!response.status) {
    const err = new Error(`Paystack create dedicated account failed: ${response.message}`);
    err.paystackResponse = response;
    throw err;
  }

  const { account_number, account_name, bank, id } = response.data;

  return {
    accountNumber: account_number,
    accountName:   account_name,
    bankName:      bank?.name || null,
    bankId:        bank?.id || null,
    bankSlug:      bank?.slug || null,
    accountId:     id,
  };
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  generateReference,
  createCustomer,
  createDedicatedAccount,
};