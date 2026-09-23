'use strict';

// src/services/errorClassifier.js
//
// Classifies a VTU provider failure into:
//
//   'definite'  — the provider DEFINITELY did NOT process the order.
//                 Safe to auto-refund (the customer keeps their money and the
//                 transaction is marked FAILED, exactly as before this fix).
//                 Evidence: the provider's own API returned a synchronous
//                 rejection (business error body / HTTP 4xx), or our own code
//                 raised a validation error before the order could be placed.
//
//   'ambiguous' — the order MAY have been processed even though we saw an
//                 error. The user could end up with the service (airtime/data/
//                 cable/electricity delivered) without being charged.
//                 MUST NOT auto-refund. The transaction is marked UNCONFIRMED
//                 and the wallet debit is preserved until an admin manually
//                 reconciles it via the admin console.
//                 Evidence: timeouts, connection resets/refusals, DNS failures,
//                 TLS failures, HTTP 5xx/408/429, response-parse errors — or
//                 simply UNKNOWN errors, where we cannot prove otherwise.
//
// The default for anything unrecognised is 'ambiguous' (fail-safe): money
// stays debited until the true outcome is known. An admin resolving a false
// positive is far cheaper than the current bug (service delivered for free).
//
// ---------------------------------------------------------------------------
// Why 5xx / 408 / 429 are ambiguous (not definite):
//   - 500/502/503/504: the upstream reseller may have received the order,
//     executed it, and crashed before/while responding. Their VTU APIs have no
//     status-query endpoint, so we cannot verify the outcome.
//   - 408 Request Timeout: the server timed out waiting for our slow request —
//     the request may still have been processed moments later.
//   - 429 Too Many Requests: often returned by a WAF/CDN AFTER the origin
//     already processed the order (double-execution is common under retries).
// 4xx business errors (400/401/403/404/409/422) are definite: the provider
// rejected the request without executing it.
// ---------------------------------------------------------------------------

// Node/axios transport error codes that prove we never got a trustworthy
// response. In every one of these cases the provider may have processed the
// order somewhere in the pipeline (TCP half-open, LB retry, provider internal
// write-ahead before respond), so they are ALL classified as ambiguous.
const AMBIGUOUS_NETWORK_CODES = new Set([
  'ECONNABORTED', // axios timeout (request was sent; server may still process it)
  'ETIMEDOUT',    // node socket timeout
  'ECONNRESET',   // peer reset — often AFTER the order was written upstream
  'ECONNREFUSED', // balancer refused; retries can land on a live instance
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETRESET',
  'ENETDOWN',
  'EPIPE',        // broken pipe — write failed AFTER partial send
  'EAI_AGAIN',    // DNS temporary failure
  'ENOTFOUND',    // DNS resolution failure
  'EADDRINFO',
  'EADDRNOTAVAIL',
  'EALREADY',
  'EINPROGRESS',
  'ESOCKETTIMEDOUT',
  'EAGAIN',
  'EWOULDBLOCK',
]);

// HTTP statuses where "the provider rejected the request" is PROVEN (definite).
// 408/429 are deliberately excluded (see the note above).
const DEFINITE_HTTP_STATUSES = new Set([400, 401, 402, 403, 404, 405, 406, 409, 410, 412, 413, 415, 422, 423, 451]);

// Message hints for transport failures thrown by the native `https` module
// and other non-axios paths that don't carry a numeric code.
const AMBIGUOUS_MESSAGE_HINTS = [
  /timed?\s*out/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONNABORTED/i,
  /connection\s*(was\s*)?(reset|refused|aborted|closed)/i,
  /ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EPIPE/i,
  /name or service not known/i,
  /getaddrinfo/i,
  /dns/i,
  /could not (resolve host|connect)/i,
  /network (is |)(unreachable|down)/i,
  /broken pipe/i,
  /operation timed out/i,
  /socket/i,
  /tls|ssl|certificate|self.signed|handshake/i,
  /empty reply from server/i,
  /parse error/i, // a response arrived but couldn't be read — likely processed
];

/**
 * Classify a provider failure.
 *
 * @param {Object}  opts
 * @param {Error}   opts.error        - the error thrown by a provider purchase method
 * @param {string}  [opts.providerName] - provider key (for logging)
 * @param {string}  [opts.operation]    - purchase operation (for logging)
 * @returns {{
 *   outcome: 'definite' | 'ambiguous',
 *   reason:  string,        // human-readable reason (surfaced to user/admin)
 *   httpStatus: number|null // provider HTTP status when present
 * }}
 */
function classifyProviderError({ error, providerName, operation }) {
  const context = `${providerName || 'provider'}.${operation || 'purchase'}`;
  const e = error || {};
  const message = String(e.message || '').trim();

  const logClassification = (outcome, why) =>
    console.log(
      `[errorClassifier] ${context} → ${outcome.toUpperCase()} (${why}) — ${message.slice(0, 240)}`
    );

  // 0. Aggregated multi-provider failure flag: set by callers (e.g. the
  //    electricity failover loop) when AT LEAST ONE of the providers tried
  //    failed ambiguously. Even if a later provider definitively rejected, an
  //    earlier one may have already processed the order → never auto-refund.
  if (e.isAmbiguousProviderFailure === true) {
    logClassification('ambiguous', 'aggregated failure — at least one provider was ambiguous');
    return {
      outcome: 'ambiguous',
      reason: message || 'At least one provider may have processed this order before the rest failed. Outcome unconfirmed.',
      httpStatus: e.httpStatus,
    };
  }

  // 1. Explicit synchronous provider rejection (business error body returned
  //    with status !== SUCCESS, or a provider-internal 400 flagged as such).
  if (e.isDefiniteProviderRejection === true) {
    logClassification('definite', 'provider returned an explicit rejection body');
    return { outcome: 'definite', reason: message || 'Provider rejected the transaction.', httpStatus: e.httpStatus };
  }

  // 2. Provider HTTP 4xx business rejection (proven not processed).
  if (Number.isInteger(e.httpStatus) &&
      e.httpStatus >= 400 && e.httpStatus < 500 &&
      DEFINITE_HTTP_STATUSES.has(e.httpStatus)) {
    logClassification('definite', `provider HTTP ${e.httpStatus}`);
    return { outcome: 'definite', reason: message || `Provider rejected the transaction (HTTP ${e.httpStatus}).`, httpStatus: e.httpStatus };
  }

  // 3. Explicit client-facing statusCode set by our own code (e.g. a 404 plan
  //    lookup or a provider 400 that surfaced as statusCode) — definite.
  if (Number.isInteger(e.statusCode) && e.statusCode >= 400 && e.statusCode < 500) {
    logClassification('definite', `internal HTTP ${e.statusCode}`);
    return { outcome: 'definite', reason: message || `Request rejected (${e.statusCode}).`, httpStatus: e.httpStatus };
  }

  // 4. Transport network error codes → ambiguous (may have been processed).
  if (e.networkCode && AMBIGUOUS_NETWORK_CODES.has(String(e.networkCode).toUpperCase())) {
    logClassification('ambiguous', `transport error ${e.networkCode}`);
    return {
      outcome: 'ambiguous',
      reason: message || `Network failure (${e.networkCode}). We could not confirm whether the provider processed this order.`,
      httpStatus: e.httpStatus,
    };
  }

  // 5. Provider HTTP 5xx / 408 / 429 → ambiguous.
  if (Number.isInteger(e.httpStatus) && e.httpStatus >= 500) {
    logClassification('ambiguous', `provider HTTP ${e.httpStatus}`);
    return {
      outcome: 'ambiguous',
      reason: message || `Provider returned HTTP ${e.httpStatus}. We could not confirm whether the order was processed.`,
      httpStatus: e.httpStatus,
    };
  }
  if (Number.isInteger(e.httpStatus) && (e.httpStatus === 408 || e.httpStatus === 429)) {
    logClassification('ambiguous', `provider HTTP ${e.httpStatus}`);
    return {
      outcome: 'ambiguous',
      reason: message || `Provider returned HTTP ${e.httpStatus}. The order may still have been processed.`,
      httpStatus: e.httpStatus,
    };
  }

  // 6. Message-level transport hints (native https module / non-axios paths).
  if (message && AMBIGUOUS_MESSAGE_HINTS.some((re) => re.test(message))) {
    logClassification('ambiguous', 'message matches a network/timeout/parse pattern');
    return {
      outcome: 'ambiguous',
      reason: message,
      httpStatus: e.httpStatus,
    };
  }

  // 7. Unrecognised error → fail-safe default: ambiguous. We cannot prove the
  //    provider did NOT process the order, so the debit stays and the admin
  //    resolves it manually.
  logClassification('ambiguous', 'unrecognised error (fail-safe default)');
  return {
    outcome: 'ambiguous',
    reason: message || 'The provider did not confirm the outcome of this transaction.',
    httpStatus: e.httpStatus,
  };
}

module.exports = { classifyProviderError, isAmbiguousProviderError };

/**
 * Lightweight (log-free) check used by callers that aggregate failures from
 * multiple providers (e.g. the electricity failover loop): does this error mean
 * the provider MAY have processed the order?
 * @param {Error} error
 * @returns {boolean}
 */
function isAmbiguousProviderError(error) {
  const e = error || {};
  // Mirror classifyProviderError's signals without the logging overhead.
  if (e.isAmbiguousProviderFailure === true) return true;
  if (e.isDefiniteProviderRejection === true) return false;
  if (Number.isInteger(e.httpStatus)) {
    if (e.httpStatus >= 500) return true;
    if (e.httpStatus === 408 || e.httpStatus === 429) return true;
    if (e.httpStatus >= 400 && e.httpStatus < 500) return false;
  }
  if (Number.isInteger(e.statusCode) && e.statusCode >= 400 && e.statusCode < 500) return false;
  if (e.networkCode && AMBIGUOUS_NETWORK_CODES.has(String(e.networkCode).toUpperCase())) return true;
  // Fail-safe default (mirrors classifyProviderError step 7): anything we cannot
  // positively prove was rejected is treated as ambiguous — the order MAY have
  // been processed, so the debit must stay until an admin reconciles it.
  return true;
}