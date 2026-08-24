'use strict';

// src/services/emailService.js
// Email sending service using nodemailer

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Use SMTP credentials from environment variables, falling back to
// a console-based logger for development when no SMTP is configured.
// ---------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@ognetwork.com';
const FROM_NAME = process.env.SMTP_FROM_NAME || 'OGNetwork Admin';

let transporter = null;

/**
 * Lazily initialise the nodemailer transporter.
 * Returns null when no SMTP credentials are configured (development mode).
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      '[emailService] SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS env vars). ' +
      'Emails will be logged to console only.'
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

// ---------------------------------------------------------------------------
// New Member Registration Template (admin notification)
// ---------------------------------------------------------------------------

/**
 * Build a simple HTML email body notifying an admin of a new member.
 */
function buildNewMemberEmailBody({ fullName, email, phone }) {
  return `
    <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:48px;height:48px;background:#2563eb;border-radius:12px;line-height:48px;text-align:center;color:#fff;font-weight:700;font-size:20px;">OG</div>
      </div>
      <h2 style="color:#1e293b;text-align:center;margin:0 0 8px;">New Member Registered</h2>
      <p style="color:#64748b;text-align:center;margin:0 0 24px;font-size:14px;">
        A new member has just created an account.
      </p>
      <div style="text-align:left;margin:24px 0;background:#f8fafc;border-radius:8px;padding:16px 20px;">
        <p style="color:#334155;font-size:14px;margin:0 0 8px;"><strong>Name:</strong> ${fullName || '—'}</p>
        <p style="color:#334155;font-size:14px;margin:0 0 8px;"><strong>Email:</strong> ${email || '—'}</p>
        <p style="color:#334155;font-size:14px;margin:0;"><strong>Phone:</strong> ${phone || '—'}</p>
      </div>
    </div>
  `;
}

/**
 * Send an admin notification email about a newly registered member.
 *
 * @param {Object}  options
 * @param {string}  options.to        - Admin recipient email address
 * @param {string}  options.fullName  - New member full name
 * @param {string}  options.email     - New member email
 * @param {string}  options.phone     - New member phone number
 * @returns {Promise<{sent:boolean, messageId?:string, reason?:string}>}
 */
async function sendNewMemberNotification({ to, fullName, email, phone }) {
  const t = getTransporter();

  if (!t) {
    // Development fallback — just log to console
    console.log('============================================================');
    console.log(`[emailService] NEW MEMBER NOTIFICATION for admin ${to}:`);
    console.log(`[emailService]   Name : ${fullName}`);
    console.log(`[emailService]   Email: ${email}`);
    console.log(`[emailService]   Phone: ${phone}`);
    console.log('============================================================');
    return { sent: true, messageId: 'console-dev' };
  }

  try {
    const info = await t.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject: 'New Member Registered',
      html: buildNewMemberEmailBody({ fullName, email, phone }),
    });

    console.log(`[emailService] New member notification sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[emailService] Failed to send new member notification to ${to}:`, error.message);
    return { sent: false, reason: error.message };
  }
}

// ---------------------------------------------------------------------------
// OTP Template
// ---------------------------------------------------------------------------

/**
 * Build a simple HTML email body for an OTP verification code.
 */
function buildOtpEmailBody(otp, action) {
  const actionLabel = action || 'update your admin login credentials';
  return `
    <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:48px;height:48px;background:#2563eb;border-radius:12px;line-height:48px;text-align:center;color:#fff;font-weight:700;font-size:20px;">OG</div>
      </div>
      <h2 style="color:#1e293b;text-align:center;margin:0 0 8px;">OTP Verification</h2>
      <p style="color:#64748b;text-align:center;margin:0 0 24px;font-size:14px;">
        Use the code below to ${actionLabel}.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;padding:16px 32px;background:#f1f5f9;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#2563eb;">${otp}</span>
      </div>
      <p style="color:#94a3b8;text-align:center;font-size:12px;margin:0;">
        This code expires in 10 minutes. If you did not request this change, please ignore this email.
      </p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send an OTP verification code to an email address.
 *
 * @param {Object}  options
 * @param {string}  options.to       - Recipient email address
 * @param {string}  options.otp      - The OTP code (6 digits)
 * @param {string}  [options.action] - Short description of the action (for email body)
 * @returns {Promise<{sent:boolean, messageId?:string, reason?:string}>}
 */
async function sendOtpEmail({ to, otp, action }) {
  const t = getTransporter();

  if (!t) {
    // Development fallback — just log to console
    console.log('============================================================');
    console.log(`[emailService] OTP for ${to}: ${otp}`);
    console.log(`[emailService] Action: ${action || 'admin credential change'}`);
    console.log('============================================================');
    return { sent: true, messageId: 'console-dev' };
  }

  try {
    const info = await t.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject: `Your OTP Code — ${action || 'Admin Login Update'}`,
      html: buildOtpEmailBody(otp, action),
    });

    console.log(`[emailService] OTP email sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[emailService] Failed to send OTP to ${to}:`, error.message);
    return { sent: false, reason: error.message };
  }
}

module.exports = {
  sendOtpEmail,
  sendNewMemberNotification,
};