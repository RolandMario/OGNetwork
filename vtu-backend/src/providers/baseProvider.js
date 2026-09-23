'use strict';

// src/providers/baseProvider.js
// Shared utilities for all VTU providers

const axios = require('axios');

/**
 * Network code mapping — standardises internal network names
 * to provider-specific codes. Each provider can override.
 */
const DEFAULT_NETWORK_MAP = {
  mtn: 'mtn',
  airtel: 'airtel',
  glo: 'glo',
  '9mobile': '9mobile',
};

/**
 * Create an axios instance with default config for a provider.
 * @param {string} baseURL - The provider's base URL
 * @param {string} apiKey - The API key/token
 * @param {string} authScheme - 'Token', 'Bearer', or custom
 * @returns {import('axios').AxiosInstance}
 */
function createApiClient(baseURL, apiKey, authScheme = 'Token') {
  return axios.create({
    baseURL,
    headers: {
      Authorization: `${authScheme} ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 55000, // 55 seconds — see note below
    // NOTE: the 55s timeout is deliberate. Provider purchase endpoints are
    // ambiguous by nature: a timeout tells us the provider MAY have processed
    // the order (the reseller APIs expose no status-query endpoint). A short
    // timeout would manufacture ambiguous failures that we can't resolve, so
    // we give providers generous time to respond and classify any timeout as
    // an UNCONFIRMED (never auto-refunded) transaction.
  });
}

/**
 * Map a network name using a provided map, or the default.
 * @param {string} network - e.g. 'mtn', 'airtel'
 * @param {Object} [networkMap] - optional override map
 * @returns {string} - provider-specific network identifier
 * @throws {Error} if network is unsupported
 */
function getNetworkCode(network, networkMap = DEFAULT_NETWORK_MAP) {
  const code = networkMap[network.toLowerCase()];
  if (!code) throw new Error(`Unsupported network: ${network}`);
  return code;
}

/**
 * Standardise a successful provider response.
 * @param {Object} options
 * @param {boolean} options.success
 * @param {string} options.providerTxId
 * @param {string} options.message
 * @returns {Object}
 */
function successResponse({ providerTxId, token, message }) {
  return {
    success: true,
    providerTxId,
    token: token || '',
    message: message || 'Transaction successful',
  };
}

/**
 * Best-effort extraction of a human-readable message from a raw provider body.
 * Scans common error field names across the reseller VTU APIs; as a last resort
 * returns the serialized body so the provider's actual response is never hidden
 * behind a generic fallback like "Electricity purchase failed".
 * @param {*} data - The raw provider response body (object or string)
 * @param {string} fallback
 * @returns {string}
 */
/**
 * Strip HTML tags/entities from a raw upstream body (Django error pages, nginx
 * 404 HTML, etc.) so it can be surfaced as a clean error message instead of raw
 * markup. Non-string values pass through untouched.
 * @param {*} str
 * @returns {*}
 */
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractProviderMessage(data, fallback = '') {
  if (typeof data === 'string') {
    const trimmed = stripHtml(data).trim();
    if (trimmed) return trimmed;
    return fallback;
  }
  if (!data || typeof data !== 'object') return fallback;

  const status = data.status ?? data.Status;
  const statusIsError =
    typeof status === 'string' && !['success', 'successful', 'true'].includes(status.toLowerCase());

  // Preferred: specific error message fields (more useful than a bare `status`).
  const direct =
    data.message ||
    data.detail ||
    data.error ||
    data.errormessage ||
    data.error_message ||
    data.errorMessage ||
    data.msg ||
    data.api_response ||
    data.response ||
    data.reason ||
    data.failure_reason ||
    data.failureReason ||
    data.FailureReason ||
    data.description ||
    data.name ||
    data.fail;
  if (direct) {
    const cleaned = stripHtml(String(direct)).trim();
    if (cleaned) return cleaned;
  }

  // Django REST Framework error format: { field: ["error message"] } or { field: "message" }
  // (skip the bare `status`/`Status` key — it's handled below).
  const firstKey = Object.keys(data).find((k) => k !== 'status' && k !== 'Status');
  if (firstKey !== undefined) {
    const firstVal = data[firstKey];
    if (Array.isArray(firstVal) && firstVal.length > 0) return `${firstKey}: ${stripHtml(String(firstVal[0])).trim()}`;
    if (typeof firstVal === 'string') return stripHtml(firstVal).trim();
  }

  // Bare status like "failed" is better than nothing.
  if (statusIsError) return String(status).trim();

  // Last resort — surface the actual raw body (truncated) so it's never lost.
  try {
    const json = JSON.stringify(data);
    if (json) return json.slice(0, 2000);
  } catch (e) {
    /* ignore */
  }
  return fallback;
}

/**
 * Extract a clean error message from an axios error (or any thrown error that
 * carries the raw provider body via `response` or `responseData`).
 * @param {Error} error
 * @param {string} fallback
 * @returns {string}
 */
function extractErrorMessage(error, fallback = 'Service temporarily unavailable') {
  // If the error carries the raw provider body (an axios `response`, or a plain
  // error with `responseData` attached), extract the REAL provider message from it.
  const rawData = error?.response?.data ?? error?.responseData;
  if (rawData !== undefined && rawData !== null) {
    const msg = extractProviderMessage(rawData);
    if (msg) return msg;
  }
  if (error.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return 'Provider service is unreachable.';
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return (error && error.message) || fallback;
}

/**
 * Wrap a provider error with its original failure metadata preserved, so the
 * error classifier (errorClassifier.js) can decide whether a purchase failure
 * was DEFINITE (provider rejected the order — safe to auto-refund) or
 * AMBIGUOUS (timeout / network blink / 5xx — the provider may have processed
 * the order, so the wallet debit must stay and the transaction must be marked
 * UNCONFIRMED for manual admin reconciliation).
 *
 * Every purchase-related catch block in the providers should throw through this
 * helper instead of `throw new Error(\`[...] ...\`)`, which currently strips the
 * axios HTTP status, the node network error code, and the raw provider body.
 *
 * @param {Object}  opts
 * @param {string}  opts.providerName - provider key, e.g. 'gladtidings'
 * @param {string}  opts.operation    - method name, e.g. 'purchaseData'
 * @param {Error}   opts.error        - the caught error (axios or node network error)
 * @param {string}  [opts.fallback]   - fallback human message
 * @returns {Error} wrapped error carrying httpStatus / networkCode / providerResponse
 */
function wrapProviderError({ providerName, operation, error, fallback }) {
  const wrapped = new Error(`[${providerName}] ${operation}: ${extractErrorMessage(error, fallback)}`);

  // Preserve an explicitly-set client-facing HTTP status (e.g. providers that
  // surface a business rejection as 400 with isDefiniteProviderRejection).
  if (error && error.statusCode) wrapped.statusCode = error.statusCode;

  // The provider's HTTP response status (axios 4xx/5xx) — the single most
  // important classification signal (4xx → definite, 5xx → ambiguous).
  wrapped.httpStatus = error?.httpStatus ?? error?.response?.status;

  // The node/axios transport error code (ECONNABORTED, ECONNRESET, ECONNREFUSED, …).
  wrapped.networkCode = error?.networkCode ?? error?.code;

  // Raw provider response body when the provider DID reply (a synchronous
  // business rejection), and the raw axios response for good measure.
  wrapped.providerResponse =
    error?.providerResponse ?? error?.response?.data ?? error?.responseData;

  // Explicit flag set by providers when their own API returned a definitive
  // rejection body (status !== SUCCESS / api_response with an error). Survives
  // re-wraps so nested catch blocks don't downgrade the classification.
  // NOTE: deliberately NOT derived from providerResponse — an axios 5xx error
  // also carries a response body, and that MUST stay ambiguous.
  wrapped.isDefiniteProviderRejection = Boolean(error?.isDefiniteProviderRejection);

  Object.defineProperty(wrapped, 'originalError', {
    value: error,
    enumerable: false,
    writable: true,
  });

  return wrapped;
}

/**
 * Check if a provider response indicates success.
 * Handles both lowercase `status` and capital `Status` fields,
 * and values like 'success', 'successful', 'SUCCESS', 'SUCCESSFUL', true.
 * @param {Object} data - The provider response data
 * @returns {boolean}
 */
function isSuccessResponse(data) {
  if (!data || typeof data !== 'object') return false;
  const status = data.status ?? data.Status;
  if (status === true) return true;
  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    return normalized === 'success' || normalized === 'successful';
  }
  return false;
}

/**
 * Normalise a cable provider identifier/name to a canonical internal key.
 * Handles dstv/gotv/startime/startimes and whitespace/punctuation variants.
 */
function normalizeCableProviderKey(str) {
  const s = String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (s === 'dstv') return 'dstv';
  if (s === 'gotv') return 'gotv';
  if (s === 'startime' || s === 'startimes') return 'startime';
  return s;
}

/** Normalise a cable package name so 'Nova (Antenna) - 1 Month' → 'novaantenna1month'. */
function normalizeCablePackageName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Cable plan container key per canonical provider, matching the upstream /user/ shape.
const CABLE_PLAN_KEYS_BY_PROVIDER = {
  gotv: 'GOTVPLAN',
  dstv: 'DSTVPLAN',
  startime: 'STARTIMEPLAN',
};

// Static cablename → numeric id fallback shared by the whole VTU platform family
// (Gladtidings/Geodnatech/Datastation /user/ responses all use these ids).
const CABLE_NAME_ID_FALLBACK = { gotv: 1, dstv: 2, startime: 3 };

/**
 * Resolve a cable provider identifier/slug to the NUMERIC cablename id that the
 * family's validateiuc / cablesub endpoints expect (e.g. 'gotv'/'GOTV'/'3' → 3
 * when the cablename list maps GOTV → 3). Mirrors step 1 of resolveCableSubscribe
 * so IUC verification reuses the same id resolution as cable purchases.
 *
 * @param {Object} cableplan - raw `Cableplan` object from the provider's /user/ response
 * @param {string} identifier - 'gotv' | 'dstv' | 'startime' | numeric id | 'GOTV'
 * @returns {number|null} numeric cablename id, or null when nothing matched
 */
function resolveCableNameId({ cableplan, identifier }) {
  const cableEntries = Array.isArray(cableplan && cableplan.cablename) ? cableplan.cablename : [];
  const provKey = normalizeCableProviderKey(identifier);

  // 1. Already numeric and recognised in the live cablename list → use as-is.
  const provNum = Number(identifier);
  if (String(identifier).trim() !== '' && !Number.isNaN(provNum)) {
    if (cableEntries.some((c) => Number(c.id) === provNum)) return provNum;
  }

  // 2. Name/slug → match against the live cablename list.
  for (const c of cableEntries) {
    if (normalizeCableProviderKey(c.name) === provKey) return Number(c.id);
  }

  // 3. Static family default — /user/ may be briefly unavailable, and these ids
  //    are stable across the whole platform family (GOTV=1, DSTV=2, STARTIME=3).
  if (CABLE_NAME_ID_FALLBACK[provKey]) return CABLE_NAME_ID_FALLBACK[provKey];

  return null;
}

/**
 * Resolve a cable subscription's `cablename` + `cableplan` to the NUMERIC primary
 * keys the Gladtidings/Geodnatech/Datastation family expects (mirrors how the
 * electricity controllers use `_resolveDiscoId`). The request body may arrive
 * with either numeric ids or legacy string slugs (e.g. plans synced from a
 * different provider such as legacy `nova`/`compact` slugs).
 *
 * @param {Object} cableplan - The raw `Cableplan` object from the provider's /user/ response.
 * @param {string} identifier - Cable provider identifier/name (e.g. 'dstv', 'startime', 'startimes', 'GOTV').
 * @param {string|number} plan - Cable plan code/slug (e.g. 'compact', 'nova', or a numeric cableplan_id).
 * @param {number} [amount] - Provider price (used to disambiguate 1‑week vs 1‑month variants of the same package).
 * @returns {{ cablename: number, cableplan: number }}
 * @throws {Error} with an actionable message when nothing matches.
 */
function resolveCableSubscribe({ cableplan, identifier, plan, amount }) {
  const provKey = normalizeCableProviderKey(identifier);

  // 1. Resolve cablename → numeric id.
  const cablenameId = resolveCableNameId({ cableplan, identifier });
  if (!cablenameId) {
    throw new Error(
      `[cable] Unrecognised cable provider "${identifier}". Re-sync cable plans from the active provider before purchasing.`
    );
  }

  // 2. Resolve cableplan → numeric id.
  const planKey = CABLE_PLAN_KEYS_BY_PROVIDER[provKey];
  const planEntries = Array.isArray(cableplan && cableplan[planKey]) ? cableplan[planKey] : [];
  const planIdOf = (x) => Number(x.cableplan_id ?? x.id);
  const planAmountOf = (x) => Number(x.plan_amount);

  // 2a. Already numeric and recognised → use as-is.
  const planNum = Number(plan);
  if (String(plan).trim() !== '' && !Number.isNaN(planNum)) {
    if (planEntries.some((x) => planIdOf(x) === planNum)) {
      return { cablename: cablenameId, cableplan: planNum };
    }
  }

  // 2b. String slug → match by package name, preferring an exact provider-price match.
  const needle = normalizeCablePackageName(plan);
  const price = Number(amount);
  const candidates = planEntries.filter((x) => needle && normalizeCablePackageName(x.package).includes(needle));
  const best =
    candidates.find((x) => !Number.isNaN(price) && planAmountOf(x) === price) ||
    candidates[0] ||
    null;

  if (best && !Number.isNaN(planIdOf(best))) {
    return { cablename: cablenameId, cableplan: planIdOf(best) };
  }

  throw new Error(
    `[cable] Could not resolve plan "${plan}" (provider: ${identifier}) on the active provider. Re-sync cable plans from the active provider before purchasing.`
  );
}

/**
 * Build a short human-readable message describing an axios HTTP error:
 *  e.g. " (HTTP 500 @ /validateiuc/) (body: {...})"
 * Used to enrich provider error messages so the real cause of an upstream
 * failure is visible instead of a bare "Request failed with status code N".
 * @param {*} error - The thrown error (usually an axios error)
 * @returns {string} Empty string when there's no HTTP response to describe
 */
function describeHttpError(error) {
  if (!error || !error.response) return '';
  const status = error.response.status;
  const path = error.config?.url || '';
  const body = error.response.data;

  let text = '';
  if (status) text += `HTTP ${status}`;
  if (path) text += (text ? ' ' : '') + `@ ${path}`;

  if (body !== undefined && body !== null) {
    let raw = typeof body === 'string' ? stripHtml(body) : JSON.stringify(body);
    if (raw && raw.length > 300) raw = `${raw.slice(0, 300)}...`;
    if (raw) text += (text ? ' — ' : '') + `body: ${raw}`;
  }

  return text ? ` (${text})` : '';
}

module.exports = {
  createApiClient,
  getNetworkCode,
  successResponse,
  extractErrorMessage,
  extractProviderMessage,
  isSuccessResponse,
  describeHttpError,
  wrapProviderError,
  resolveCableSubscribe,
  resolveCableNameId,
  normalizeCableProviderKey,
  stripHtml,
  DEFAULT_NETWORK_MAP,
};
