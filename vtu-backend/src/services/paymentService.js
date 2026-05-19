// src/services/paymentService.js
const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const paystackClient = axios.create({
    baseURL: 'https://api.paystack.co',
    headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
    },
});

/**
 * Initialize a payment transaction on Paystack
 * @param {string} email - User's email
 * @param {number} amountMajor - Amount in Naira
 * @param {string} internalRef - Your unique transaction reference
 * @returns {Promise<string>} - The authorization URL to redirect the user to
 */
exports.initializePaystackTransaction = async (email, amountMajor, internalRef) => {
    try {
        // Paystack expects amount in Kobo
        const amountInKobo = Math.round(amountMajor * 100);

        const response = await paystackClient.post('/transaction/initialize', {
            email,
            amount: amountInKobo,
            reference: internalRef,
            // callback_url: `${process.env.FRONTEND_URL}/payment/callback` // Where frontend handles return
        });

        if (response.data && response.data.status === true) {
            return response.data.data.authorization_url;
        } else {
            throw new Error('Paystack initialization failed');
        }
    } catch (error) {
        console.error('Payment Service Error:', error.message);
        throw new Error(error.response?.data?.message || 'Payment gateway unavailable');
    }
};

/**
 * Verify a transaction reference after user returns
 * @param {string} reference - The trxRef to verify
 * @returns {Promise<object>} - The verified transaction data
 */
exports.verifyPaystackTransaction = async (reference) => {
    try {
        const response = await paystackClient.get(`/transaction/verify/${encodeURIComponent(reference)}`);

        if (response.data && response.data.status === true && response.data.data.status === 'success') {
             // Ensure amount paid matches expected amount (important security check)
             return {
                 success: true,
                 amountPaidKobo: response.data.data.amount,
                 gatewayRef: response.data.data.id
             };
        }
        
        throw new Error('Transaction verification failed or was not successful');

    } catch (error) {
        throw new Error(error.response?.data?.message || 'Verification failed');
    }
};