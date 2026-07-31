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
 * Extract a clean error message from an axios error.
 * @param {Error} error
 * @param {string} fallback
 * @returns {string}
 */
function extractErrorMessage(error, fallback = 'Service temporarily unavailable') {
  if (error.response) {
    const data = error.response.data;
    // Try common error response shapes
    return (
      data?.message ||
      data?.detail ||
      data?.error ||
      data?.msg ||
      (typeof data === 'string' ? data : null) ||
      fallback
    );
  }
  if (error.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return 'Provider service is unreachable.';
  }
  return error.message || fallback;
}

module.exports = {
  createApiClient,
  getNetworkCode,
  successResponse,
  extractErrorMessage,
  DEFAULT_NETWORK_MAP,
};