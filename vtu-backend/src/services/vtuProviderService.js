// src/services/vtuProviderService.js
const axios = require('axios');

// Load sensitive keys from environment variables
const PROVIDER_API_KEY = process.env.VTU_PROVIDER_API_KEY;
const PROVIDER_BASE_URL = process.env.VTU_PROVIDER_BASE_URL; // e.g., 'https://api.somevtuycompany.com/v1'

// Create an axios instance with default headers
const apiClient = axios.create({
    baseURL: PROVIDER_BASE_URL,
    headers: {
        'Authorization': `Bearer ${PROVIDER_API_KEY}`,
        'Content-Type': 'application/json',
    },
    timeout: 20000, // 20 seconds timeout is crucial for fintech
});


const getProviderNetworkCode = (network) => {
    const codes = {
        'mtn': '01',
        'airtel': '02',
        'glo': '03',
        '9mobile': '04'
        // Add others depending on your provider's documentation
    };
    const code = codes[network.toLowerCase()];
    if (!code) throw new Error(`Unsupported network: ${network}`);
    return code;
}

/**
 * Sends airtime to a phone number via external provider.
 * @param {string} phone - The recipient phone number
 * @param {number} amountMajor - The amount in Naira (not kobo)
 * @param {string} network - e.g., 'mtn', 'airtel'
 * @param {string} internalRef - Your unique transaction reference (trxRef)
 * @returns {Promise<object>} - Standardized success response
 * @throws {Error} - Throws error if provider fails
 */
exports.sendAirtime = async (phone, amountMajor, network, internalRef) => {
    try {
        // 1. Map internal network names to provider specific codes if necessary
        const networkCodes = {
            'mtn': '01',
            'airtel': '02',
            'glo': '03',
            '9mobile': '04'
        };
        const providerNetworkCode = getProviderNetworkCode(network);

        if (!providerNetworkCode) throw new Error(`Unsupported network: ${network}`);

        // 2. Make the actual API call
        // The payload structure MUST match your specific provider's documentation.
        const response = await apiClient.post('/v1/airtime', {
            phone: phone,
            airtimeType:"VTU",
            amount: amountMajor,
            networkId: providerNetworkCode,
            reference: internalRef // Important: Send your ref to them for reconciliation
        });

        // 3. Standardize the response before returning to controller
        // Different providers have weird response formats. Normalize it here.
        if (response.data && response.data.status === 'success') {
             return {
                 success: true,
                 providerTxId: response.data.transaction_id, // The provider's ref
                 message: response.data.message
             };
        } else {
             // Provider responded HTTP 200, but with a logical failure
             throw new Error(response.data.message || 'Provider indicated failure');
        }

    } catch (error) {
        // Handle Axios errors (network down, timeouts, 4xx/5xx responses)
        console.error('VTU Provider Error:', error.response?.data || error.message);
        // Throw a clean error message up to the controller
        throw new Error(error.response?.data?.message || 'Service provider temporarily unavailable');
    }
};

// Other methods would go here:
// exports.sendData = async (phone, planId, network, internalRef) => { ... }

exports.sendData = async (phone, planId, network, internalRef) => {
    try {
        const networkCode = getProviderNetworkCode(network);

        // IMPORTANT: Your actual provider will have specific field names.
        // This is a generic example payload.
        const payload = {
            phone_number: phone,
            network_id: networkCode,
            plan_code: planId, // The provider usually needs the plan ID
            request_id: internalRef // Always send your ref for reconciliation
        };

        // Make the external call
        // NOTE: In development without a real API, uncomment the mock block below.

        // --- REAL API CALL ---
        // const response = await apiClient.post('/data/purchase', payload);

        // --- MOCK API CALL (For testing without a real provider) ---
        console.log(`[MOCK API] Sending Data: ${planId} to ${phone} (Ref: ${internalRef})`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
        // Simulate success (randomly fail sometimes for testing robustness)
        if (Math.random() < 0.1) throw new Error("Simulated Provider Downtime");
        const response = {
             data: {
                 status: 'success',
                 message: 'Data plan activated successfully',
                 transaction_id: `PROV_${Math.floor(Math.random() * 1000000)}`
             }
        };
        // ---------------------------


        // Standardize response
        if (response.data && response.data.status === 'success') {
            return {
                success: true,
                providerTxId: response.data.transaction_id,
                message: response.data.message || 'Data purchase successful'
            };
        } else {
            // Provider handled request but returned a business logic failure
            throw new Error(response.data.message || 'Provider reported failure');
        }

    } catch (error) {
        console.error('VTU Data Service Error:', error.message);
        // Extract meaningful error message from provider response if available
        const errorMessage = error.response?.data?.message || error.message || 'Service temporarily unavailable';
        throw new Error(errorMessage);
    }
};
// exports.validateMeter = async (meterNumber, discoType) => { ... }

// src/services/vtuProviderService.js

// ... (Keep existing imports, apiClient setup, and getProviderNetworkCode helper) ...

// --- Helper for Cable Providers mapping ---
const getCableProviderCode = (provider) => {
    const codes = {
        'dstv': 'dstv',
        'gotv': 'gotv',
        'startimes': 'startimes'
        // Add mappings according to your specific provider API docs
    };
     const code = codes[provider.toLowerCase()];
     if (!code) throw new Error(`Unsupported cable provider: ${provider}`);
     return code;
}

// ... (Keep existing sendAirtime and sendData functions) ...


/**
 * Sends a Cable TV subscription activation request to the external provider.
 * @param {string} smartCardNumber - The customer's IUC or Smartcard number
 * @param {string} planId - The internal plan ID (e.g., 'dstv-premium')
 * @param {string} provider - e.g., 'dstv', 'gotv'
 * @param {string} internalRef - Your unique transaction reference (UUID)
 * @returns {Promise<object>} - Standardized success response
 */
exports.sendCableSubscription = async (smartCardNumber, planId, provider, internalRef) => {
    try {
        const providerCode = getCableProviderCode(provider);

        // IMPORTANT: Adjust payload structure to match your actual provider's API docs.
        const payload = {
            smartcard_number: smartCardNumber,
            service_id: providerCode,
            plan_code: planId,
            request_id: internalRef
        };

        // --- MOCK API CALL (For development/testing safety) ---
        // In production, replace this block with: const response = await apiClient.post('/cable/purchase', payload);
        console.log(`[MOCK API] Activating Cable: ${provider.toUpperCase()} plan '${planId}' for Card ${smartCardNumber} (Ref: ${internalRef})`);
        await new Promise(resolve => setTimeout(resolve, 2500)); // Simulate slightly longer network delay for cable

        // Simulate random failure scenarios (e.g., invalid smartcard)
        const rand = Math.random();
        if (rand < 0.1) throw new Error("Provider Error: Invalid Smartcard Number");
        if (rand < 0.2) throw new Error("Provider Error: Bouquet change not allowed currently");

        const response = {
             data: {
                 status: 'success',
                 message: 'Cable subscription activated successfully. Viewing restored.',
                 transaction_id: `CABLE_${Math.floor(Math.random() * 1000000)}`
             }
        };
        // ---------------------------


        // Standardize response
        if (response.data && response.data.status === 'success') {
            return {
                success: true,
                providerTxId: response.data.transaction_id,
                message: response.data.message
            };
        } else {
             // Provider responded HTTP 200 OK, but with a logical failure message
             throw new Error(response.data.message || 'Provider reported subscription failure');
        }

    } catch (error) {
        console.error('VTU Cable Service Error:', error.message);
        const errorMessage = error.response?.data?.message || error.message || 'Cable service temporarily unavailable';
        throw new Error(errorMessage);
    }
};



// src/services/vtuProviderService.js

// ... (keep existing imports and apiClient config) ...

// --- Helper for Electricity Provider Codes ---
const getElectricityProviderCode = (providerSlug) => {
    // Map your internal slugs (e.g., from frontend dropdown) to provider specific codes
    const codes = {
        'ikeja-electric': 'ikeja_disco',
        'eko-electric': 'eko_disco',
        'abuja-electric': 'abuja_disco',
        'enugu-electric': 'enugu_disco',
        // ... others like port-harcourt, kano, etc.
    };
    const code = codes[providerSlug.toLowerCase()];
    if (!code) throw new Error(`Unsupported electricity provider: ${providerSlug}`);
    return code;
}


// ... (keep existing sendAirtime, sendData, sendCableSubscription) ...


/**
 * Validates an electricity meter number with the provider.
 * @param {string} meterNumber - The meter number input
 * @param {string} providerSlug - Internal slug for the disco (e.g., 'ikeja-electric')
 * @returns {Promise<object>} - The customer details if found
 */
exports.validateMeter = async (meterNumber, providerSlug) => {
    try {
        const providerCode = getElectricityProviderCode(providerSlug);

        // IMPORTANT: Different providers use different methods for lookup.
        // Some use POST, some use GET parameters. Check your specific docs.
        // This example assumes a POST request to a lookup endpoint.

        // --- MOCK API CALL (For development safety) ---
        // In production, uncomment real call and remove mock block.
        // const response = await apiClient.post('/electricity/validate', {
        //    meter_number: meterNumber,
        //    service_id: providerCode
        // });

        console.log(`[MOCK API] Validating Meter: ${meterNumber} for ${providerSlug}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

        // Simulate fake validation rules
        if (meterNumber.length !== 10) {
             throw new Error("Provider Error: Invalid meter number length. Must be 10 digits.");
        }

        // Simulate successful response structure
        const mockResponse = {
            data: {
                status: 'success',
                message: 'Meter validated successfully',
                data: {
                    customer_name: 'MOCK CUSTOMER NAME HERE',
                    address: 'Block 123, Mock Street, Lagos',
                    meter_number: meterNumber,
                    // Some providers return outstanding balance, be careful showing this.
                }
            }
        };
        // ---------------------------

        // Standardize response for the controller
        if (mockResponse.data && mockResponse.data.status === 'success') {
             const customerData = mockResponse.data.data;
             return {
                 success: true,
                 // Ensure we return consistent field names to our frontend
                 customerName: customerData.customer_name,
                 address: customerData.address || 'N/A',
                 meterNumber: customerData.meter_number
             };
        } else {
             throw new Error(mockResponse.data.message || 'Unable to validate meter number');
        }

    } catch (error) {
        console.error('Meter Validation Service Error:', error.message);
        // Pass the specific error message from the provider (e.g., "Meter not found") up to controller
        throw new Error(error.response?.data?.message || error.message || 'Validation service unavailable');
    }
};