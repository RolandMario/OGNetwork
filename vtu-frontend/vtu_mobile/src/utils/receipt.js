// src/utils/receipt.js
//
// Receipt building helpers shared by the mobile receipt screen (on-screen view,
// PDF generation via expo-print and sharing via expo-sharing).
//
// Transaction amounts are stored in KOBO (base unit) across the backend, so all
// money formatting here divides by 100.

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a kobo amount as Naira, e.g. 150000 → "₦1,500.00" */
export function formatNaira(amountKobo) {
  const value = Number(amountKobo || 0) / 100;
  return `₦${value.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Full localised date + time, e.g. "22 Aug 2026, 02:45 PM" */
export function formatReceiptDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Transaction → readable mapping
// ---------------------------------------------------------------------------

/** Human friendly service name / icon key for a transaction type. */
export function getServiceMeta(type) {
  switch (type) {
    case 'AIRTIME':
      return { label: 'Airtime', icon: 'phone', color: '#2563EB' };
    case 'DATA':
      return { label: 'Data Bundle', icon: 'wifi', color: '#805AD5' };
    case 'CABLE':
      return { label: 'Cable TV', icon: 'television', color: '#DD6B20' };
    case 'ELECTRICITY':
      return { label: 'Electricity', icon: 'lightning-bolt', color: '#D69E2E' };
    case 'FUNDING':
    case 'MANUAL_FUNDING':
      return { label: 'Wallet Funding', icon: 'wallet-plus', color: '#38A169' };
    case 'COMMISSION':
      return { label: 'Commission', icon: 'cash-multiple', color: '#38A169' };
    case 'COMMISSION_WITHDRAWAL':
      return { label: 'Commission Withdrawal', icon: 'swap-horizontal', color: '#3182CE' };
    case 'ADMIN_CREDIT':
      return { label: 'Admin Credit', icon: 'wallet-plus', color: '#38A169' };
    case 'ADMIN_DEBIT':
      return { label: 'Admin Debit', icon: 'wallet-minus', color: '#E53E3E' };
    default:
      return { label: type || 'Transaction', icon: 'receipt', color: '#718096' };
  }
}

/** Title line used inside the receipt, e.g. "MTN Airtime — 08012345678". */
export function getReceiptTitle(tx) {
  const { type, details } = tx || {};
  switch (type) {
    case 'AIRTIME':
      return `${String(details?.network || '').toUpperCase() || ''} Airtime — ${details?.beneficiary || ''}`;
    case 'DATA':
      return `${details?.planName || details?.planId || 'Data Bundle'} — ${details?.beneficiary || ''}`;
    case 'CABLE':
      return `${details?.planName || details?.planId || 'Cable TV'} — IUC ${details?.beneficiary || ''}`;
    case 'ELECTRICITY':
      return `${details?.planName || 'Electricity'} — Meter ${details?.beneficiary || ''}`;
    case 'FUNDING':
    case 'MANUAL_FUNDING':
      return 'Wallet Funding';
    case 'COMMISSION':
      return `Commission — ${details?.service || 'Service'} purchase`;
    case 'COMMISSION_WITHDRAWAL':
      return 'Commission Withdrawn to Wallet';
    default:
      return type || 'Transaction';
  }
}

/**
 * Flatten a transaction + user into an array of { label, value } receipt rows.
 * Used by both the on-screen receipt and the PDF generation so the two always
 * match.
 */
export function buildReceiptRows({ transaction, user } = {}) {
  const tx = transaction || {};
  const { type, details = {}, amount, status = 'PENDING', profit = 0, newBalance } = tx;
  const u = user || tx.user || {};

  const rows = [];

  // 1. Service / item description
  rows.push({ label: 'Service', value: (getServiceMeta(type) || {}).label || type || 'Transaction' });
  rows.push({ label: 'Description', value: getReceiptTitle(tx) || '—' });

  if (type === 'AIRTIME') {
    rows.push({ label: 'Network', value: String(details.network || '—').toUpperCase() });
    rows.push({ label: 'Phone Number', value: details.beneficiary || '—' });
  } else if (type === 'DATA') {
    rows.push({ label: 'Plan', value: details.planName || details.planId || '—' });
    rows.push({ label: 'Beneficiary', value: details.beneficiary || '—' });
  } else if (type === 'CABLE') {
    rows.push({ label: 'Plan', value: details.planName || details.planId || '—' });
    rows.push({ label: 'IUC Number', value: details.beneficiary || '—' });
  } else if (type === 'ELECTRICITY') {
    rows.push({ label: 'Plan', value: details.planName || '—' });
    rows.push({ label: 'Meter Number', value: details.beneficiary || '—' });
    rows.push({ label: 'Meter Type', value: String(details.meterType || '—').toUpperCase() });
    if (details.token) rows.push({ label: 'Buy Token', value: details.token });
  }

  // Beneficiary for funding / commission
  if (type === 'FUNDING' && details.paymentMethod) {
    rows.push({
      label: 'Payment Method',
      value: String(details.paymentMethod).replace(/_/g, ' '),
    });
  }
  if (type === 'COMMISSION') {
    rows.push({ label: 'Source', value: `Commission from ${details.service || 'a'} purchase` });
  }

  if (details.provider) rows.push({ label: 'VTU Provider', value: details.provider });

  // 2. Payment totals
  rows.push({ label: 'Amount Paid', value: formatNaira(amount) });
  if (type === 'COMMISSION' || type === 'FUNDING' || type === 'MANUAL_FUNDING' || type === 'ADMIN_CREDIT') {
    rows.push({ label: 'Amount Credited', value: formatNaira(amount) });
  }
  if (profit > 0) {
    rows.push({ label: 'Commission Earned', value: formatNaira(profit) });
  }
  if (details.failureReason) {
    rows.push({ label: 'Note', value: details.failureReason });
  }

  // 3. Balances
  if (newBalance != null) rows.push({ label: 'Wallet Balance After', value: formatNaira(newBalance) });

  // 4. Trails
  rows.push({ label: 'Transaction Reference', value: tx.transactionReference || '—' });
  if (tx.providerRef) rows.push({ label: 'Provider Reference', value: tx.providerRef });
  if (tx.paymentGatewayRef) rows.push({ label: 'Payment Reference', value: tx.paymentGatewayRef });

  return rows;
}

// ---------------------------------------------------------------------------
// Small escape helper (the transaction fields are stored as plain text)
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
/**
 * Build a fully styled, printable receipt in HTML. Used with
 * expo-print's printToFileAsync to generate a shareable PDF.
 */
export function buildReceiptHtml({ transaction, user } = {}) {
  const tx = transaction || {};
  const u = user || tx.user || {};
  const rows = buildReceiptRows({ transaction, user });
  const meta = getServiceMeta(tx.type);
  const status = tx.status || 'PENDING';
  const statusColor = status === 'SUCCESS' ? '#10B981' : status === 'FAILED' ? '#EF4444' : '#F59E0B';

  const rowsHtml = rows
    .map(
      ({ label, value }) => `
        <div class="row">
          <span class="row-label">${escapeHtml(label)}</span>
          <span class="row-value">${escapeHtml(String(value))}</span>
        </div>`
    )
    .join('\n');

  const customerLine = [u.fullName, u.phone, u.email].filter(Boolean).join(' • ') || '—';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${escapeHtml(tx.transactionReference || '')}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif;
        background-color: #F4F7FA;
        font-size: 13px;
        color: #1A202C;
        padding: 24px 12px;
      }
      .receipt {
        max-width: 440px;
        margin: 0 auto;
        background: #FFFFFF;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid #E2E8F0;
      }
      .header {
        background: #0A2540;
        color: #fff;
        text-align: center;
        padding: 28px 20px 22px;
      }
      .header .brand { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
      .header .tagline { font-size: 11px; color: #98C1D9; margin-top: 3px; letter-spacing: 1px; }
      .header .receipt-title { margin-top: 14px; font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #00C897; }
      .status-pill {
        display: inline-block; margin-top: 10px; padding: 4px 12px;
        border-radius: 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
        color: #fff; background: ${statusColor};
      }
      .body { padding: 20px; }
      .customer {
        background: #F8FAFC; border: 1px solid #EDF2F7; border-radius: 10px;
        padding: 12px 14px; margin-bottom: 14px; font-size: 12px; color: #475569;
      }
      .customer strong { display: block; font-size: 13px; color: #0A2540; margin-bottom: 2px; }
      .row {
        display: flex; justify-content: space-between; gap: 16px;
        padding: 7px 0; border-bottom: 1px dashed #E2E8F0; align-items: baseline;
      }
      .row:last-child { border-bottom: none; }
      .row-label { color: #718096; flex-shrink: 0; }
      .row-value { text-align: right; font-weight: 600; color: #1A202C; word-break: break-word; }
      .meta-row .row-value { text-align: right; font-weight: 600; color: #1A202C; }
      .total {
        margin-top: 8px; padding: 14px; background: #F0FDFA; border: 1px solid #A7F3D0;
        border-radius: 10px; display: flex; justify-content: space-between; align-items: center;
      }
      .total .t-label { font-size: 12px; font-weight: 600; color: #065F46; }
      .total .t-value { font-size: 18px; font-weight: 800; color: #047857; }
      .footer { text-align: center; padding: 18px 20px 22px; color: #94A3B8; font-size: 10.5px; line-height: 1.6; }
      .footer .thanks { color: #64748B; font-weight: 600; font-size: 12px; margin-bottom: 4px; }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="header">
        <div class="brand">OG NETWORK</div>
        <div class="tagline">VTU &amp; BILLS SERVICES</div>
        <div class="receipt-title">OFFICIAL RECEIPT</div>
        <span class="status-pill">${escapeHtml(status)}</span>
      </div>
      <div class="body">
        <div class="customer"><strong>${escapeHtml(customerLine)}</strong></div>
        <div class="row meta-row"><span class="row-label">Date &amp; Time</span><span class="row-value">${escapeHtml(formatReceiptDate(tx.createdAt))}</span></div>
        ${rowsHtml}
        <div class="total">
          <span class="t-label">TOTAL</span>
          <span class="t-value">${escapeHtml(formatNaira(tx.amount))}</span>
        </div>
      </div>
      <div class="footer">
        <div class="thanks">Thank you for your patronage!</div>
        <div>This is a system-generated receipt for transaction ${escapeHtml(tx.transactionReference || '')}.<br/>Contact support if you need any assistance.</div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Plain-text version of the receipt — used as a fallback share option if PDF
 * generation fails, and as the admin dashboard's downloadable file.
 */
export function buildReceiptText({ transaction, user } = {}) {
  const tx = transaction || {};
  const u = user || tx.user || {};
  const rows = buildReceiptRows({ transaction, user });

  const line = (label, value) => `${label}: ${value === undefined || value === null ? '—' : value}`;

  const parts = [
    '========================================',
    '         OG NETWORK - OFFICIAL RECEIPT',
    '========================================',
    line('Receipt Date', formatReceiptDate(tx.createdAt)),
    line('Status', tx.status || 'PENDING'),
    '',
    line('Customer', [u.fullName, u.phone, u.email].filter(Boolean).join(' • ') || '—'),
    '',
    ...rows.map((r) => line(r.label, r.value)),
    '----------------------------------------',
    `TOTAL: ${formatNaira(tx.amount)}`,
    '========================================',
    'This is a system-generated receipt.',
    'Thank you for your patronage!',
    '========================================',
  ];

  return parts.join('\n');
}
