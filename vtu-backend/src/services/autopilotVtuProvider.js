import axios from 'axios';

// --- CONFIGURATION ---
// IMPORTANT: Replace 'process.env.AUTOPILOT_API_KEY' with your actual environment variable access.
// BASE_URL is inferred from the documentation (Production endpoint)
const BASE_URL = process.env.VTU_PROVIDER_BASE_URL || 'https://autopilotng.com/api/test';
const API_KEY = process.env.VTU_PROVIDER_API_KEY;

// Map local network names to AutopilotNG's required networkId (from Get Networks endpoint)
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
    // Authorization header as required by the documentation
    'Authorization': `Bearer ${API_KEY}`,
  },
});

/**
 * @desc Executes an airtime purchase request via the AutopilotNG API.
 * @param {object} params - The transaction details.
 * @param {string} params.phone - The recipient's phone number.
 * @param {number} params.amount - The airtime amount (in Naira/major unit).
 * @param {string} params.network - The local network name ('mtn', 'airtel', etc.).
 * @param {string} params.reference - Your unique internal transaction reference (idempotency).
 * @param {string} [params.airtimeType='VTU'] - The type of airtime product (e.g., 'VTU', 'AWUF').
 * @returns {Promise<object>} The raw response data from AutopilotNG.
 * 
 * 
 * 
 */


exports.getAirtimeTypes = async (networkId) => {
  try {
    // AutopilotNG typically has an endpoint to fetch active services/networks
// change axios.get to axios.post
const response = await axios.post(`${BASE_URL}/v1/load/airtime-types`, 
  { networkId: networkId }, // The body
  {
    headers: { 
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
);

    // We filter or map the response to return only mobile network providers
    return response.data; 
  } catch (error) {
    console.error("Error fetching Autopilot networks:", error.message, error);
    throw error;
  }
};




export const buyAirtime = async ({ phone, amount, selectedNetwork, reference, airtimeType = 'AWOOF4U' }) => {
  if (!API_KEY) {
    throw new Error('VTU Provider API key is not configured.');
  }

  // const networkId = NETWORK_MAP[network.toLowerCase()];

  if (!selectedNetwork) {
    throw new Error(`Unsupported network: ${selectedNetwork}`);
  }

  // --- 1. Construct the Payload ---
  // The payload is constructed based on the required parameters inferred from the docs:
  // (networkId, airtimeType, phone, amount, and reference).
  const payload = {
    networkId: selectedNetwork.toString(), // AutopilotNG often expects IDs as strings
    airtimeType: airtimeType.toUpperCase(),
    phone: phone, // Phone number
    amount: amount.toString(), // Amount in major currency unit (Naira)
    reference: reference, // Your internal request ID for idempotency
  };
  console.log('buyAirtime Payload: ', payload)
  try {
    // --- 2. Make the API call to the inferred purchase endpoint ---
    // The Buy Airtime endpoint is inferred to be '/v1/airtime' based on the pattern of other services.
    const response = await autopilotClient.post('/v1/airtime', payload);

    // --- 3. Handle AutopilotNG's Status/Code ---
    if (response.data.status === true && response.data.code === 200) {
      return {
        success: true,
        providerReference: response.data.data.reference, // The external ref
        message: response.data.data.message,
        // Optionally include new partner balance for logging/reporting
      };
    } else {
      // Handle known successful API communication but failed transaction status (e.g., insufficient balance)
      throw new Error(response.data.data.message || `Transaction failed with code ${response.data.code}`);
    }

} catch (error) {
    // 1. Log the full provider response to see the REAL reason
    if (error.response) {
        console.error("🔥 AUTOPILOT API ERROR BODY:", JSON.stringify(error.response.data, null, 2));
    }
    
    // 2. Re-throw with more detail
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`AutopilotNG Failed: ${errorMessage}`);
}
};





// data provider

// services/autopilotVtuProvider.js
// const axios = require('axios');

// services/autopilotVtuProvider.js


// const API_URL = 'https://autopilotng.com/api/v1'; 
// const API_KEY = process.env.AUTOPILOT_API_KEY;

exports.getNetworkProviders = async () => {
  try {
    // AutopilotNG typically has an endpoint to fetch active services/networks
// change axios.get to axios.post
const response = await axios.post(`${BASE_URL}/v1/load/networks`, 
  { networks: "all" }, // The body
  {
    headers: { 
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
);

    // We filter or map the response to return only mobile network providers
    return response.data; 
  } catch (error) {
    console.error("Error fetching Autopilot networks:", error.message, error);
    throw error;
  }
};



// get dataType

exports.getDataTypes = async (networkId) => {
  try {
    // AutopilotNG typically has an endpoint to fetch active services/networks
// change axios.get to axios.post
const response = await axios.post(`${BASE_URL}/v1/load/data-types`, 
  { networkId: networkId }, // The body
  {
    headers: { 
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
);

    // We filter or map the response to return only mobile network providers
    return response.data; 
  } catch (error) {
    console.error("Error fetching Autopilot networks:", error.message, error);
    throw error;
  }
};


// fetch data plans

// services/autopilotVtuProvider.js

exports.getDataPlans = async (networkId, dataType) => {
  try {
    const response = await axios.post(`${BASE_URL}/v1/load/data`, 
      { networkId, dataType }, 
      {
        headers: { 
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // This returns the raw list of plans for that network
    return response.data; 
  } catch (error) {
    console.error("Autopilot Fetch Plans Error:", error.message, error);
    throw error;
  }
};

// const API_URL = 'https://autopilotng.com/api/v1'; // Check Autopilot docs for exact base URL
// const API_KEY = process.env.AUTOPILOT_API_KEY;

exports.buyData = async (payload) => {
  // Payload expected: { networkId, phone, planId, reference }
  try {
    const response = await axios.post(`${BASE_URL}/v1/data`, {
      network: payload.networkId,     // e.g., '1' for MTN, '2' for GLO
      mobile_number: payload.phone,
      plan: payload.planId,           // The specific data plan ID from Autopilot
      Ported_number: true,            // Usually required for efficiency
      payment_medium: "MAIN WALLET"   // Or specific config
    }, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    return response.data;
  } catch (error) {
    // Pass the error up to the controller to handle 424s etc.
    throw error;
  }
};



exports.getAllCables = async () => {
    try {
    const response = await axios.post(`${BASE_URL}/v1/load/cable-types`, 
      { cables:'all'}, 
      {
        headers: { 
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // This returns the raw list of plans for that network
    return response.data; 
  } catch (error) {
    console.error("Autopilot Fetch cables Error:", error.message, error);
    throw error;
  }
}


exports.getCablePackages = async (cableType) => {
      try {
    const response = await axios.post(`${BASE_URL}/v1/load/cable-packages`, 
      { cableType}, 
      {
        headers: { 
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // This returns the raw list of plans for that network
    return response.data; 
  } catch (error) {
    console.error("Autopilot Fetch cables Error:", error.message, error);
    throw error;
  }
}


exports.validateSmartCardNo = async (cableType, smartCardNo) => {
        try {
    const response = await axios.post(`${BASE_URL}/v1/validate/smartcard-no`, 
      { cableType, smartCardNo}, 
      {
        headers: { 
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // This returns the raw list of plans for that network
    return response.data; 
  } catch (error) {
    console.error("Autopilot Fetch cables Error:", error.message, error);
    throw error;
  }
}

exports.buyCable = async ({cableType, planId, paymentTypes, customerName, smartCardNo, reference, phoneNo}) => {
          try {
    const response = await axios.post(`${BASE_URL}/v1/cable`, 
      { cableType, planId, paymentTypes, customerName, reference, phoneNo, smartCardNo}, 
      {
        headers: { 
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // This returns the raw list of plans for that network
    return response.data; 
  } catch (error) {
    console.error("Autopilot Fetch cables Error:", error.message, error);
    throw error;
  }
}