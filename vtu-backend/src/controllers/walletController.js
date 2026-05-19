//const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { v4: uuidv4 } = require('uuid');
const { initializePaystackTransaction } = require('../services/paymentService');

/**
 * @desc    Get user wallet balance
 * @route   GET /api/v1/wallet/balance
 * @access  Private
 */
exports.getBalance = async (req, res) => {
  try {

    // --- NEW WAY: Access models via req.models ---
    const Wallet = req.models.Wallet;

    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found for this user' });
    }

    // IMPORTANT: Return balance in major unit (e.g., Naira) for frontend display
    const balanceInMajorUnit = wallet.balance / 100;

    res.status(200).json({
      status: 'success',
      data: {
        balance: balanceInMajorUnit,
        currency: wallet.currency
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Initiate wallet funding (Before calling Payment Gateway)
 * @route   POST /api/v1/wallet/fund/initiate
 * @access  Private
 */
exports.initiateFunding = async (req, res) => {
  try {

    const Wallet = req.models.Wallet;
    const Transaction = req.models.Transaction;
    const { amount } = req.body; // Amount in Major Unit (e.g., 500 Naira)

    // Basic Validation
    if (!amount || isNaN(amount) || amount < 100) {
        // Enforcing a minimum funding amount (e.g., 100 Naira)
        return res.status(400).json({ message: 'Invalid amount. Minimum funding is N100.' });
    }

    const amountInKobo = Math.round(amount * 100); // Convert to base unit
    const trxRef = uuidv4(); // Generate unique internal reference

    // Create a PENDING transaction record
    // This is crucial for reconciliation if the user completes payment but network fails upon return.
    const newTransaction = await Transaction.create({
      user: req.user._id,
      type: 'FUNDING',
      amount: amountInKobo,
      status: 'PENDING',
      transactionReference: trxRef,
      details: {
        beneficiary: 'Self',
        network: 'N/A', // Not applicable for funding
      },
      // Previous/New balance are unknown until funding succeeds
    });

    // --- NEXT STEPS IN REAL APP ---
    // 1. You would now use a service to call Paystack/Flutterwave API to initialize payment.
    // 2. You would pass `amountInKobo`, user email, and `trxRef` to the gateway.
    // 3. The gateway returns a payment URL.
    // 4. You return that URL to the frontend.

    const paystackUrlPayment = await initializePaystackTransaction(req.user.email, amount, trxRef)

    // Mock response for now:
    res.status(201).json({
        status: 'success',
        message: 'Funding initiated. Proceed to payment gateway.',
        data: {
            transactionReference: trxRef,
            amountToPay: amount,
             paymentUrl: paystackUrlPayment  //'https://paystack.com/pay/...' // In real scenario
        }
    });

  } catch (error) {
    console.error('Funding Init Error:', error);
    res.status(500).json({ status: 'error', message: 'Could not initiate funding.' });
  }
};

// Note: A separate Webhook controller is needed to handle the response from Paystack/Flutterwave 
// to actually credit the wallet and update the transaction status to SUCCESS.

// src/controllers/walletController.js
// ... existing imports ...
const paymentService = require('../services/paymentService'); // Import your payment service

// ... existing getBalance, initiateFunding ...

/**
 * @desc    Verify payment and credit wallet
 * @route   POST /api/v1/user/wallet/verify
 * @access  Private
 */
exports.verifyFunding = async (req, res) => {
    const session = await req.dbConnection.startSession();
    session.startTransaction();

    try {
        const { reference } = req.body; // The reference you generated in initiateFunding
        const Transaction = req.models.Transaction;
        const Wallet = req.models.Wallet;

        // 1. Find the transaction in YOUR database first
        const transaction = await Transaction.findOne({ transactionReference: reference }).session(session);

        if (!transaction) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Transaction reference not found' });
        }

        // 2. IDEMPOTENCY CHECK: Check if already successful
        // This prevents double crediting if the user clicks "Verify" twice.
        if (transaction.status === 'SUCCESS') {
            await session.abortTransaction();
            return res.status(200).json({ 
                status: 'success', 
                message: 'Transaction already verified and wallet funded.' 
            });
        }

        // 3. Call Paystack via your Service to confirm status
        // This is the specific line you asked about:
        const verificationResult = await paymentService.verifyPaystackTransaction(reference);

        if (verificationResult.success) {
            // 4. Update Wallet Balance (Atomic)
            // Ensure the amount paid matches what was expected
            // Note: Paystack returns Kobo, DB stores Kobo.
            if (verificationResult.amountPaidKobo < transaction.amount) {
                 await session.abortTransaction();
                 return res.status(400).json({ message: 'Amount paid is less than requested amount.' });
            }

            const updatedWallet = await Wallet.findOneAndUpdate(
                { user: req.user._id },
                { $inc: { balance: verificationResult.amountPaidKobo } }, // Add money
                { new: true, session }
            );

            // 5. Update Transaction Status
            transaction.status = 'SUCCESS';
            transaction.paymentGatewayRef = verificationResult.gatewayRef;
            transaction.newBalance = updatedWallet.balance;
            await transaction.save({ session });

            await session.commitTransaction();

            return res.status(200).json({
                status: 'success',
                message: 'Wallet funded successfully',
                data: {
                    newBalance: updatedWallet.balance / 100 // Return major unit
                }
            });
        } else {
            throw new Error('Payment verification failed at gateway');
        }

    } catch (error) {
        await session.abortTransaction();
        console.error("Verification Error:", error.message);
        return res.status(400).json({ 
            status: 'error', 
            message: error.message || 'Could not verify payment' 
        });
    } finally {
        session.endSession();
    }
};