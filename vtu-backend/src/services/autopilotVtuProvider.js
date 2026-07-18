const axios = require('axios');

// --- CONFIGURATION ---
const BASE_URL = process.env.VTU_PROVIDER_BASE_URL || 'https://autopilotng.com/api/test';
const API_KEY = process.env.VTU_PROVIDER_API_KEY;

// Map local network names to AutopilotNG's required networkId
const NETWORK_MAP = {
  mtn: 1,
  airtel: 2,
  glo: 3,
  '9mobile': 4,
};

// Create an Axios instance for AutopilotNG with mandatory headers
const autopilotClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  },
});

/**
 * Get available network providers from AutopilotNG
 */
exports.getNetworkProviders = async () => {
  try {
    const response = await autopilotClient.post('/v1/load/networks', {
      networks: 'all',
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching Autopilot networks:', error.message);
    throw error;
  }
};

/**
 * Get airtime types for a specific network
 */
exports.getAirtimeTypes = async (networkId) => {
  try {
    const response = await autopilotClient.post('/v1/load/airtime-types', {
      networkId: networkId,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching airtime types:', error.message);
    throw error;
  }
};

/**
 * Buy airtime from AutopilotNG
 */
exports.buyAirtime = async ({
  phone,
  amount,
  selectedNetwork,
  reference,
  airtimeType = 'AWOOF4U',
}) => {
  if (!API_KEY) {
    throw new Error('VTU Provider API key is not configured.');
  }

  if (!selectedNetwork) {
    throw new Error(`Unsupported network: ${selectedNetwork}`);
  }

  const payload = {
    networkId: selectedNetwork.toString(),
    airtimeType: airtimeType.toUpperCase(),
    phone: phone,
    amount: amount.toString(),
    reference: reference,
  };

  console.log('buyAirtime Payload:', payload);

  try {
    const response = await autopilotClient.post('/v1/airtime', payload);

    if (response.data.status === true && response.data.code === 200) {
      return {
        success: true,
        providerReference: response.data.data.reference,
        message: response.data.data.message,
      };
    } else {
      throw new Error(
        response.data.data.message || `Transaction failed with code ${response.data.code}`
      );
    }
  } catch (error) {
    if (error.response) {
      console.error('🔥 AUTOPILOT API ERROR:', JSON.stringify(error.response.data, null, 2));
    }
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`AutopilotNG Failed: ${errorMessage}`);
  }
};
