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
    timeout: 30000, // 30 seconds
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
function successResponse({ providerTxId, message }) {
  return {
    success: true,
    providerTxId,
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
function extractProviderMessage(data, fallback = '') {
  if (typeof data === 'string') {
    const trimmed = data.trim();
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
    data.fail;
  if (direct) return String(direct).trim();

  // Django REST Framework error format: { field: ["error message"] } or { field: "message" }
  // (skip the bare `status`/`Status` key — it's handled below).
  const firstKey = Object.keys(data).find((k) => k !== 'status' && k !== 'Status');
  if (firstKey !== undefined) {
    const firstVal = data[firstKey];
    if (Array.isArray(firstVal) && firstVal.length > 0) return `${firstKey}: ${String(firstVal[0])}`;
    if (typeof firstVal === 'string') return firstVal;
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

module.exports = {
  createApiClient,
  getNetworkCode,
  successResponse,
  extractErrorMessage,
  extractProviderMessage,
  isSuccessResponse,
  DEFAULT_NETWORK_MAP,
};
