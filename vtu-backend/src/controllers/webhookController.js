'use strict';

// src/controllers/webhookController.js

const crypto = require('crypto');
const { getAllSecretKeys, getTenantConfigBySecretKey } = require('../services/tenantConfigService');
const { getTenantConnection } = require('../services/tenantDbService');
const { creditWallet } = require('./walletController');
const paymentService = require('../services/paymentService');

/**
 * @desc    Handle Paystack webhook events
 * @route   POST /api/v1/webhooks/paystack
 * @access  Public — verified via HMAC-SHA512 signature
 */
exports.handlePaystackWebhook = async (req, res) => {
  console.log('[Webhook] Paystack webhook received.');

  const signature = req.headers['x-paystack-signature'];

  if (!Buffer.isBuffer(req.body) || !signature) {
    return res.status(400).send('Webhook: Missing body or signature.');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (e) {
    console.error('[Webhook] Failed to parse body:', e.message);
    return res.status(400).send('Webhook: Invalid JSON body.');
  }

  // Identify tenant by verifying HMAC against every known Paystack secret key
  let tenantConfig = null;
  for (const key of getAllSecretKeys()) {
    const hmac = crypto
      .createHmac('sha512', key)
      .update(req.body)
      .digest('hex');

    if (hmac === signature) {
      tenantConfig = getTenantConfigBySecretKey(key);
      break;
    }
  }

  if (!tenantConfig) {
    console.warn('[Webhook] Unauthorized: signature matched no known tenant key.');
    return res.status(401).send('Webhook: Unauthorized.');
  }

  console.log(`[Webhook] Authenticated for tenant: ${tenantConfig.tenantId}`);

  // Acknowledge immediately — Paystack retries if no 200 within 5s
  res.status(200).send('Webhook received.');

  // Process asynchronously so HTTP response is never blocked
  setImmediate(() => processWebhookEvent(event, tenantConfig));
};

// ---------------------------------------------------------------------------
// Event processor
// ---------------------------------------------------------------------------

async function processWebhookEvent(event, tenantConfig) {
  const { tenantId } = tenantConfig;

  try {
    const connection  = getTenantConnection(tenantId);
    const Transaction = connection.models.Transaction;
    const Wallet      = connection.models.Wallet;
    const User        = connection.models.User;

    if (!Transaction || !Wallet || !User) {
      console.error(`[Webhook] Models not found for tenant "${tenantId}".`);
      return;
    }

    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data, { Transaction, Wallet, User, tenantId });
        break;
      default:
        console.log(`[Webhook] Unhandled event: "${event.event}" — ignoring.`);
    }

  } catch (err) {
    console.error(`[Webhook] processWebhookEvent error for tenant "${tenantId}":`, err.message);
  }
}

// ---------------------------------------------------------------------------
// charge.success
//
// Two distinct flows land here, distinguished by event.data.channel:
//
//   1. Checkout flow (channel: 'card', 'bank', 'ussd', 'bank_transfer' via
//      /transaction/initialize) — a Transaction document already exists,
//      created by initiateFunding(). We match it by `reference`.
//
//   2. Dedicated Virtual Account flow (channel: 'dedicated_nuban') —
//      the user transferred money directly to their assigned account.
//      NO Transaction document exists yet — Paystack generates its own
//      reference. We must identify the user via event.data.customer.customer_code
//      (or event.data.authorization.receiver_bank_account_number) and
//      create a new FUNDING transaction + credit the wallet.
// ---------------------------------------------------------------------------

async function handleChargeSuccess(data, ctx) {
  const { Transaction, Wallet, User, tenantId } = ctx;
  const channel = data.channel;

  console.log(`[Webhook] charge.success — channel: "${channel}", ref: ${data.reference}, amount: ₦${data.amount / 100}`);

  if (channel === 'dedicated_nuban') {
    return handleDedicatedAccountCredit(data, ctx);
  }

  return handleCheckoutCredit(data, ctx);
}

// ---------------------------------------------------------------------------
// Checkout flow — existing PENDING transaction, match by reference
// ---------------------------------------------------------------------------

async function handleCheckoutCredit(data, { Transaction, Wallet, tenantId }) {
  const reference  = data.reference;
  const amountKobo = data.amount;
  const gatewayRef = data.id;

  try {
    const transaction = await Transaction.findOne({ transactionReference: reference });

    if (!transaction) {
      console.warn(`[Webhook] Checkout transaction ref "${reference}" not found — may be a DVA event with no pre-created record. Ignoring.`);
      return;
    }

    const { alreadyProcessed, balance } = await creditWallet({
      transaction,
      amountKobo,
      gatewayRef,
      Transaction,
      Wallet,
    });

    if (alreadyProcessed) {
      console.log(`[Webhook] Transaction "${reference}" already processed — skipping.`);
      return;
    }

    console.log(
      `[Webhook] ✅ Wallet funded (checkout) — tenant: "${tenantId}" | ` +
      `user: ${transaction.user} | amount: ₦${amountKobo / 100} | new balance: ₦${balance / 100}`
    );

  } catch (err) {
    console.error(`[Webhook] handleCheckoutCredit error for ref "${reference}":`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Dedicated Virtual Account flow — no pre-existing transaction.
// Identify user via customer_code, create FUNDING transaction, credit wallet.
// ---------------------------------------------------------------------------

async function handleDedicatedAccountCredit(data, { Transaction, Wallet, User, tenantId }) {
  const amountKobo  = data.amount;
  const gatewayRef  = data.id;
  const paystackRef = data.reference;
  const customerCode = data.customer?.customer_code;
  const receiverAccount = data.authorization?.receiver_bank_account_number;
  const senderName  = data.authorization?.sender_bank
    ? `${data.authorization.sender_bank} - ${data.authorization.sender_name || 'Unknown'}`
    : 'Bank Transfer';

  if (!customerCode && !receiverAccount) {
    console.error('[Webhook] DVA credit missing both customer_code and receiver_account — cannot identify user.', {
      reference: paystackRef,
    });
    return;
  }

  try {
    // 1. Find the user — try customerCode first, fall back to account number
    let user = null;

    if (customerCode) {
      user = await User.findOne({ paystackCustomerCode: customerCode });
    }

    if (!user && receiverAccount) {
      user = await User.findOne({ 'dedicatedAccount.accountNumber': receiverAccount });
    }

    if (!user) {
      console.error(
        `[Webhook] DVA credit — no user found for customer_code "${customerCode}" / ` +
        `account "${receiverAccount}". Funds received but NOT credited. ` +
        `Manual reconciliation needed. Paystack ref: ${paystackRef}`
      );
      return;
    }

    // 2. Idempotency — Paystack may retry webhooks. Check if we've already
    //    recorded this exact gateway reference.
    const existing = await Transaction.findOne({ paymentGatewayRef: String(gatewayRef) });
    if (existing) {
      console.log(`[Webhook] DVA credit — gatewayRef "${gatewayRef}" already processed. Skipping.`);
      return;
    }

    // 3. Create a new FUNDING transaction record for this transfer
    const wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) {
      console.error(`[Webhook] DVA credit — wallet not found for user ${user._id}.`);
      return;
    }

    const transaction = await Transaction.create({
      user:                 user._id,
      type:                 'FUNDING',
      amount:               amountKobo,
      status:               'PENDING',
      transactionReference: paymentService.generateReference(),
      paymentGatewayRef:    String(gatewayRef),
      previousBalance:      wallet.balance,
      newBalance:           wallet.balance, // updated by creditWallet below
      details: {
        method:        'dedicated_account_transfer',
        senderName,
        paystackReference: paystackRef,
        accountNumber: receiverAccount,
      },
    });

    // 4. Credit wallet using the shared helper
    const { alreadyProcessed, balance } = await creditWallet({
      transaction,
      amountKobo,
      gatewayRef,
      Transaction,
      Wallet,
    });

    if (alreadyProcessed) {
      console.log(`[Webhook] DVA transaction "${transaction.transactionReference}" already processed — skipping.`);
      return;
    }

    console.log(
      `[Webhook] ✅ Wallet funded (DVA transfer) — tenant: "${tenantId}" | ` +
      `user: ${user._id} | amount: ₦${amountKobo / 100} | new balance: ₦${balance / 100} | ` +
      `from: ${senderName}`
    );

  } catch (err) {
    console.error(`[Webhook] handleDedicatedAccountCredit error for ref "${paystackRef}":`, err.message);
  }
}