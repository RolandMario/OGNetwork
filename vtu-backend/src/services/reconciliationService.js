'use strict';

// src/services/reconciliationService.js
//
// Manual reconciliation + stale-housekeeping for UNCONFIRMED transactions.
//
// An UNCONFIRMED transaction is a purchase whose provider outcome we could not
// verify at request time (timeout / network failure / HTTP 5xx). We deliberately
// KEEP the wallet debit in place — the user may have received the service — and
// it is the admin's job to establish the true outcome through the only honest
// channel available (the provider's own support/portal — none of the reseller
// APIs expose a status-query endpoint), then record the decision here.
//
// Resolve semantics:
//   - resolution = 'FAILED'  → provider did NOT deliver → refund the debit and
//                              mark FAILED (customer money goes back).
//   - resolution = 'SUCCESS' → order WAS delivered → keep the debit, mark
//                              SUCCESS, and best-effort credit any commission.
//
// NEVER auto-resolve. The whole point of this fix is that money stays debited
// until the true outcome is known.

const emailService = require('./emailService');

// A purchase still PENDING longer than this can only mean the server process
// died mid-request (e.g. Vercel function timeout / deploy restart after the
// debit was written but before the provider call finished). The debit is
// already applied, so the transaction must surface to the admin queue instead
// of hanging invisibly. It is NEVER auto-refunded — merely surfaced.
const STALE_PENDING_HOURS = Number(process.env.UNCONFIRMED_STALE_PENDING_HOURS || 24);

const PURCHASE_TYPES = ['AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'];

/**
 * Resolve an UNCONFIRMED (or stale PENDING) purchase manually.
 *
 * @param {Object}  opts
 * @param {string}  opts.transactionId
 * @param {string}  opts.resolution   - 'SUCCESS' (provider delivered) | 'FAILED' (refund customer)
 * @param {string}  [opts.note]       - admin note recorded on the transaction
 * @param {Object}  opts.Transaction
 * @param {Object}  opts.Wallet
 * @param {Object}  [opts.AdminConfig] - used for best-effort commission credit on SUCCESS
 * @param {Object}  [opts.adminUser]   - the admin performing the resolution
 * @returns {Promise<Object>} the updated transaction
 * @throws {Error} with statusCode for bad input / wrong state
 */
async function resolveTransaction({ transactionId, resolution, note, Transaction, Wallet, AdminConfig, adminUser }) {
  if (!transactionId) throw Object.assign(new Error('transactionId is required.'), { statusCode: 400 });
  if (!['SUCCESS', 'FAILED'].includes(resolution)) {
    throw Object.assign(new Error('resolution must be "SUCCESS" or "FAILED".'), { statusCode: 400 });
  }

  const tx = await Transaction.findById(transactionId).populate('user', 'fullName email phone');
  if (!tx) throw Object.assign(new Error('Transaction not found.'), { statusCode: 404 });

  const isResolvable =
    tx.status === 'UNCONFIRMED' ||
    (tx.status === 'PENDING' && PURCHASE_TYPES.includes(tx.type));
  if (!isResolvable) {
    throw Object.assign(
      new Error(`Only UNCONFIRMED (or stale PENDING purchase) transactions can be resolved; this one is ${tx.status}.`),
      { statusCode: 409 }
    );
  }

  const resolvedBy = adminUser ? adminUser._id || adminUser.id : null;
  const capturedReason = String(tx.failureReason || (tx.details && tx.details.failureReason) || '').trim();
  const resolutionFields = {
    resolvedBy,
    resolvedAt: new Date(),
    resolutionNote: String(note || '').trim(),
  };

  if (resolution === 'FAILED') {
    // Refund the debit: the provider did not deliver, so the customer's money
    // goes back and the transaction is closed.
    const walletUpdate = await Wallet.findOneAndUpdate(
      { user: tx.user },
      { $inc: { balance: tx.amount } },
      { new: true }
    );
    if (!walletUpdate) {
      throw Object.assign(
        new Error('Wallet not found for this user — refund could not be applied. No status change was made.'),
        { statusCode: 500 }
      );
    }

    const updated = await Transaction.findOneAndUpdate(
      { _id: tx._id },
      {
        ...resolutionFields,
        status:  'FAILED',
        newBalance: walletUpdate.balance,
        failureReason: capturedReason || 'Reconciled by admin: provider did not deliver the order.',
      },
      { new: true }
    );

    console.log(
      `[reconciliation] Tx ${transactionId} resolved → FAILED (refunded ₦${tx.amount / 100}). Reason: ${capturedReason || 'n/a'}. By: ${resolvedBy}`
    );
    return updated;
  }

  // SUCCESS — the order WAS delivered. Keep the debit (already correct),
  // record the audit trail, and best-effort credit any commission the user is
  // owed for this purchase (never fails the resolve).
  const updated = await Transaction.findOneAndUpdate(
    { _id: tx._id },
    {
      ...resolutionFields,
      status: 'SUCCESS',
      failureReason: '',
    },
    { new: true }
  );

  // Best-effort credit any commission owed for this delivery (never fails).
  try {
    const commissionService = require('./commissionService');
    await commissionService.creditPurchaseCommission({
      userId: tx.user,
      amountDebitedKobo: tx.amount,
      service: tx.type.toLowerCase(),
      Wallet,
      Transaction,
      AdminConfig,
      sourceReference: tx.transactionReference,
    });
  } catch (err) {
    console.error(`[reconciliation] Commission credit failed for resolved tx ${transactionId}:`, err.message);
  }

  console.log(
    `[reconciliation] Tx ${transactionId} resolved → SUCCESS (debit retained). By: ${resolvedBy}`
  );
  return updated;
}

/**
 * Sweep pass for transactions stuck without an outcome:
 *   1. PENDING purchases older than STALE_PENDING_HOURS → UNCONFIRMED so they
 *      surface in the admin reconciliation queue (covers process-death cases
 *      where the request never reached a catch block).
 *   2. Sends a digest email to admins whenever open UNCONFIRMED transactions
 *      exist, so the queue is not silently ignored.
 *
 * @param {Object} opts - { Transaction, User }
 * @returns {Promise<{swept:number, open:number, digest:Object|null}>}
 */
async function sweepStaleUnconfirmed({ Transaction, User }) {
  const cutoff = new Date(Date.now() - STALE_PENDING_HOURS * 3600 * 1000);

  const stale = await Transaction.find({
    type: { $in: PURCHASE_TYPES },
    status: 'PENDING',
    createdAt: { $lt: cutoff },
  }).lean();

  const staleReason =
    'Stuck in PENDING (the server likely died mid-request). Outcome unknown — admin must reconcile.';

  let swept = 0;
  for (const tx of stale) {
    await Transaction.findOneAndUpdate(
      { _id: tx._id },
      {
        status:        'UNCONFIRMED',
        failureReason: staleReason,
        details:       { ...(tx.details || {}), failureReason: staleReason },
      }
    );
    swept += 1;
    console.log(`[reconciliation] Stale PENDING purchase ${tx._id} (${tx.type}, ₦${tx.amount / 100}) → UNCONFIRMED.`);
  }

  const open = await Transaction.countDocuments({ status: 'UNCONFIRMED' });
  const digest = open > 0 ? await sendUnconfirmedDigest({ Transaction, User }) : null;

  if (swept > 0 || open > 0) {
    console.log(`[reconciliation] Sweep complete — swept ${swept} stale PENDING, ${open} open UNCONFIRMED${digest ? `, digest sent: ${digest.sent}` : ''}.`);
  }

  return { swept, open, digest };
}
/**
 * Email a digest of open UNCONFIRMED transactions to all admins.
 * Falls back to a console log when SMTP is not configured (see emailService).
 *
 * @param {Object} opts - { Transaction, User }
 * @returns {Promise<{sent:boolean, reason?:string}>}
 */
async function sendUnconfirmedDigest({ Transaction, User }) {
  try {
    const open = await Transaction.find({ status: 'UNCONFIRMED' })
      .sort({ createdAt: -1 })
      .limit(25)
      .populate('user', 'fullName email')
      .lean();

    if (!open.length) return { sent: true, reason: 'nothing-open' };

    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } })
      .select('email')
      .lean();
    const to = [...new Set(admins.map((a) => (a.email || '').trim()).filter(Boolean))];
    if (!to.length) return { sent: false, reason: 'no admin emails configured' };

    const rows = open.map((tx) => {
      const u = tx.user || {};
      return {
        ref:      tx.transactionReference,
        customer: u.fullName || '—',
        email:    u.email || '',
        type:     tx.type,
        amount:   tx.amount / 100,
        created:  tx.createdAt ? tx.createdAt.toISOString() : '—',
        reason:   String(tx.failureReason || '').slice(0, 140),
      };
    });

    const rowsHtml = rows.map((r) => `
      <tr style="font-size:12px;border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 12px;font-family:monospace;">${r.ref}</td>
        <td style="padding:8px 12px;">${r.customer}<br/><span style="color:#94a3b8;">${r.email}</span></td>
        <td style="padding:8px 12px;">${r.type}</td>
        <td style="padding:8px 12px;">&#8358;${r.amount}</td>
        <td style="padding:8px 12px;white-space:nowrap;">${r.created}</td>
        <td style="padding:8px 12px;max-width:240px;word-break:break-word;">${r.reason}</td>
      </tr>`).join('\n');

    const html = `
      <div style="max-width:820px;margin:0 auto;font-family:Arial,sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <div style="display:inline-block;width:48px;height:48px;background:#2563eb;border-radius:12px;text-align:center;color:#fff;font-weight:700;font-size:20px;">OG</div>
        <h2 style="color:#1e293b;margin:0 0 8px;">⚠️ Unconfirmed Transactions</h2>
        <p style="color:#64748b;font-size:14px;margin:0 0 4px;">
          ${open.length} purchase(s) are awaiting manual reconciliation. Their provider outcome could not be
          confirmed at purchase time (timeout / network failure / HTTP 5xx), so the customer wallet was NOT refunded
          and the order MAY have been delivered.
        </p>
        <p style="color:#b45309;font-size:13px;margin:0 0 20px;">
          Action required: confirm each order's status with the VTU provider, then mark it
          <strong>SUCCESS</strong> (delivered — keep the debit) or <strong>FAILED</strong> (not delivered — refund) in the admin dashboard
          (Transactions → filter UNCONFIRMED → open the receipt).
        </p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;">
              <th style="padding:8px 12px;">Reference</th>
              <th style="padding:8px 12px;">Customer</th>
              <th style="padding:8px 12px;">Type</th>
              <th style="padding:8px 12px;">Amount</th>
              <th style="padding:8px 12px;">Created</th>
              <th style="padding:8px 12px;">Provider error</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    const result = await emailService.sendAdminDigest({
      to,
      subject: `[OGNetwork] ${open.length} unconfirmed transaction(s) awaiting reconciliation`,
      html,
    });

    console.log(`[reconciliation] Unconfirmed digest ${result.sent ? 'sent' : 'NOT sent'} to ${to.join(', ')}${result.reason ? ` (${result.reason})` : ''}.`);
    return result;
  } catch (err) {
    console.error('[reconciliation] sendUnconfirmedDigest error:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { resolveTransaction, sweepStaleUnconfirmed, sendUnconfirmedDigest };