const mongoose = require('mongoose');
const bcrypt = require('bcryptjs')
const vtuProviderService = require('../services/vtuProviderService'); // Mock service wrapper around Axios
const { v4: uuidv4 } = require('uuid');
const { getNetworkProviders,
         getDataTypes, 
         getAirtimeTypes, 
         buyAirtime,
         getAllCables,
         getCablePackages,
         validateSmartCardNo,
         buyCable
          } = require('../services/autopilotVtuProvider');

exports.purchaseAirtime = async (req, res) => {
    const { amount, phone, network } = req.body;
    const userId = req.user._id;
    const amountInKobo = amount * 100; // Assuming input is NGN

    // 1. Start MongoDB Session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const trxRef = uuidv4(); // Generate internal unique reference

        // 2. Check Wallet Balance & Atomically Deduct
        // We use findOneAndUpdate with session to lock the document temporarily
        const wallet = await Wallet.findOneAndUpdate(
            { user: userId, balance: { $gte: amountInKobo } }, // Condition: Balance must be sufficient
            { $inc: { balance: -amountInKobo } }, // Action: Deduct amount
            { new: true, session } // Options: return new doc, use session
        );

        if (!wallet) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        // 3. Create PENDING Transaction record within session
        const newTransaction = await Transaction.create([{
            user: userId,
            type: 'AIRTIME',
            amount: amountInKobo,
            status: 'PENDING',
            transactionReference: trxRef,
            details: { beneficiary: phone, network: network },
            previousBalance: wallet.balance + amountInKobo,
            newBalance: wallet.balance
        }], { session });

        // 4. CALL EXTERNAL VTU PROVIDER API (The risky part)
        // This call happens *outside* Mongo boundaries. We wait for its response.
        const providerResponse = await vtuProviderService.sendAirtime({
            phone, amount, network, ref: trxRef
        });

        if (providerResponse.success) {
            // 5a. Success path: Update transaction status to SUCCESS
            await Transaction.updateOne(
                { transactionReference: trxRef },
                { status: 'SUCCESS', providerRef: providerResponse.providerTxId },
                { session }
            );
            
            // Commit changes to database permanently
            await session.commitTransaction();
            session.endSession();

            return res.status(200).json({ 
                success: true, 
                message: 'Airtime sent successfully',
                data: newTransaction[0]
            });

        } else {
            // 5b. External Provider Failed path (e.g., provider downtime)
            throw new Error(providerResponse.errorMessage || "Provider failed");
        }

    } catch (error) {
        // 6. Rollback everything if anything went wrong in the try block
        // The wallet deduction is reversed automatically here.
        await session.abortTransaction();
        session.endSession();

        console.error("Purchase Error", error);

        // Optional: You might want to log a FAILED transaction record here outside the transaction for visibility
        // But the core financial data is safe.

        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Transaction failed. Your wallet has not been charged.' 
        });
    }
};




// --- MOCK Price Lookup Helper ---
// In production, replace this with a database call to a 'DataPlan' model.
const getPlanDetails = async (planId, network) => {
    // This simulates a DB lookup
    const mockPlans = {
        'mtn': {
            'mtn-1gb-monthly': { priceMajor: 300, name: 'MTN 1GB Monthly' },
            'mtn-5gb-monthly': { priceMajor: 1200, name: 'MTN 5GB Monthly' },
        },
        'airtel': {
            'airtel-2gb-weekly': { priceMajor: 500, name: 'Airtel 2GB Weekly' },
        }
        // ... add more plans
    };

    const networkPlans = mockPlans[network.toLowerCase()];
    if (!networkPlans || !networkPlans[planId]) {
        return null;
    }
    return networkPlans[planId];
};


/**
 * @desc    Purchase Data Plan
 * @route   POST /api/v1/vtu/data
 * @access  Private
 */
exports.purchaseData = async (req, res) => {
    let session;
    try {
        const { phone, planId, network } = req.body;
        const userId = req.user._id; // From 'protect' middleware

        // 1. Basic Input Validation
        if (!phone || !planId || !network) {
            return res.status(400).json({ message: 'Please provide phone, planId, and network' });
        }

        // 2. Determine Price (Security Check)
        // Never accept price from frontend. Lookup price based on planId.
        const planDetails = await getPlanDetails(planId, network);
        if (!planDetails) {
            return res.status(400).json({ message: 'Invalid Plan ID or Network' });
        }

        const amountMajor = planDetails.priceMajor;
        const amountInKobo = Math.round(amountMajor * 100); // Convert to base unit for DB

        // 3. Start MongoDB Session for Atomicity
        session = await mongoose.startSession();
        session.startTransaction();
        const trxRef = uuidv4(); // Generate unique internal reference

        // 4. Check Wallet & Atomically Deduct
        // Using findOneAndUpdate with conditions ensures we don't go negative due to race conditions.
        const wallet = await Wallet.findOneAndUpdate(
            {
                user: userId,
                balance: { $gte: amountInKobo } // Condition: Must have enough funds
            },
            { $inc: { balance: -amountInKobo } }, // Action: Deduct funds
            { new: true, session } // Passes session so this rolls back on failure
        );

        if (!wallet) {
            // Wallet not found OR insufficient balance condition met
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient funds based on plan price.' });
        }

        // 5. Create PENDING Transaction Record (within session)
        const newTransaction = await Transaction.create([{
            user: userId,
            type: 'DATA',
            amount: amountInKobo,
            status: 'PENDING',
            transactionReference: trxRef,
            details: {
                beneficiary: phone,
                network: network,
                planId: planId,
                planName: planDetails.name
            },
            previousBalance: wallet.balance + amountInKobo, // Calculate previous balance
            newBalance: wallet.balance
        }], { session });


        // 6. CALL EXTERNAL VTU PROVIDER SERVICE (The risky operation)
        // This happens *outside* the database, but our session is still open.
        console.log(`Attempting external data purchase for ref: ${trxRef}`);
        const providerResponse = await vtuProviderService.sendData(
            phone,
            planId, // Send plan ID to provider
            network,
            trxRef
        );

        // 7. SUCCESS PATH
        // If code reaches here, the provider confirmed success.

        // Update transaction status to SUCCESS
        await Transaction.updateOne(
            { transactionReference: trxRef },
            {
                status: 'SUCCESS',
                providerRef: providerResponse.providerTxId
            },
            { session }
        );

        // Commit the transaction permanently to the database
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: providerResponse.message,
            data: {
                transactionReference: trxRef,
                status: 'SUCCESS',
                amountPaid: amountMajor,
                planName: planDetails.name
            }
        });

    } catch (error) {
        // 8. FAILURE PATH (Rollback)
        // If anything failed (service threw error, DB error, etc.)

        if (session) {
            // Abort transaction: The wallet deduction is automatically reversed.
            await session.abortTransaction();
            session.endSession();
        }

        console.error("Data Purchase Transaction Failed & Rolled back:", error.message);

        // Return failure response. The user's money is safe.
        return res.status(500).json({
            success: false,
            message: error.message || 'Transaction failed. Your wallet has not been charged.'
        });
    }
};

exports.handleCableTypes = async (req, res) => {
  try {
    const cableTypesData = await getAllCables();

    res.json({
      success: true,
      data: cableTypesData
    })
  } catch (error) {
    console.error('error fetching cables types', error)
  }
}

exports.handleCablePackages = async (req, res) => {
try {
  const {cableType} = req.query
  const cablePackages = await getCablePackages(cableType)
  res.json({
    success: true,
    data: cablePackages
  })
} catch (error) {
    console.error('error fetching cables packages', error)
}

}


exports.verifySmartCardNo = async (req, res) => {
  try {
    const {cableType, smartCardNo} = req.body

    const verifyCard = await validateSmartCardNo(cableType, smartCardNo)
    if(verifyCard.status){
     return res.json({
        success: true,
        result: verifyCard
      })
    }
   return res.status(401).json({error: "Wrong Smart Card No"})

  } catch (error) {
    console.log('smart card verification failed', error)
  }
}

// src/controllers/vtuController.js

// ... (Keep existing imports: mongoose, uuid, Wallet, Transaction, vtuProviderService) ...

// ... (Keep existing getPlanDetails helper for Data) ...


// --- MOCK Cable Price Lookup Helper ---
// In production, replace this with a DB query to a 'CablePlan' model.
// NEVER trust prices sent from the frontend.
const getCablePlanDetails = async (planId, provider) => {
    // Mock Database of cable plans
    const mockCablePlans = {
        'dstv': {
            'dstv-padi': { priceMajor: 2500, name: 'DStv Padi' },
            'dstv-yanga': { priceMajor: 3500, name: 'DStv Yanga' },
            'dstv-premium': { priceMajor: 24500, name: 'DStv Premium' },
        },
        'gotv': {
            'gotv-jinja': { priceMajor: 1900, name: 'GOtv Jinja' },
            'gotv-max': { priceMajor: 4850, name: 'GOtv Max' },
        },
        'startimes': {
             'startimes-nova': { priceMajor: 1200, name: 'StarTimes Nova' }
        }
    };

    const providerPlans = mockCablePlans[provider.toLowerCase()];
    if (!providerPlans || !providerPlans[planId]) {
        return null;
    }
    return providerPlans[planId];
};


// ... (Keep existing purchaseAirtime and purchaseData controllers) ...


/**
 * @desc    Purchase Cable TV Subscription
 * @route   POST /api/v1/vtu/cable
 * @access  Private
 */
exports.purchaseCable = async (req, res) => {
    let session;
    try {
        const { cableType, smartCardNo, amount, planId, paymentTypes, customerName } = req.body;
        const userId = req.user._id;

        // 1. Basic Input Validation
        if (!smartCardNo || !planId ) {
            return res.status(400).json({ message: 'Please provide smartCardNumber and/or planId' });
        }

        // 2. Secure Price Lookup (Backend side)
        // const planDetails = await getCablePlanDetails(planId, provider);
        // if (!planDetails) {
        //     return res.status(400).json({ message: 'Invalid Provider or Plan ID' });
        // }

        // const amountMajor = planDetails.priceMajor;
        const amountInKobo = Math.round(amount * 100);

        // 3. Start Atomicity Session
        session = await mongoose.startSession();
        session.startTransaction();
        const reference = uuidv4();

        // 4. Check Wallet & Atomically Deduct
        const  Wallet = req.models.Wallet
        const wallet = await Wallet.findOneAndUpdate(
            {
                user: userId,
                balance: { $gte: amountInKobo } // Must have enough balance
            },
            { $inc: { balance: -amountInKobo } }, // Deduct
            { new: true, session }
        );

        if (!wallet) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient funds for this subscription plan.' });
        }

        // 5. Create PENDING Transaction Record
        const  Transaction = req.models.Transaction
        await Transaction.create([{
            user: userId,
            type: 'CABLE',
            amount: amountInKobo,
            status: 'PENDING',
            transactionReference: reference,
            details: {
                beneficiary: smartCardNo, // The smartcard is the beneficiary
                cableType: cableType,          // e.g., dstv
                planId: planId,
                customerName: customerName,
                paymentTypes: paymentTypes // planName: planDetails.name
            },
            previousBalance: wallet.balance + amountInKobo,
            newBalance: wallet.balance
        }], { session });


        // 6. CALL EXTERNAL SERVICE (Risky operation outside DB)
        console.log(`Attempting external cable activation for ref: ${reference}`);
        const providerResponse = await buyCable({
            smartCardNo,
            planId,
            cableType,
            reference,
            customerName,
            paymentTypes,
    });

        // 7. SUCCESS PATH
        // Update transaction status to SUCCESS
        await Transaction.updateOne(
            { transactionReference: reference},
            {
                status: 'SUCCESS',
                providerRef: providerResponse.data.reference
            },
            { session }
        );

        // Commit transaction permanently
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: providerResponse.data.message,
            data: {
                transactionReference: reference,
                status: 'SUCCESS',
                amountPaid: amountMajor,
                // planName: planDetails.name,
                smartCardNumber: smartCardNo
            }
        });

    } catch (error) {
        // 8. FAILURE PATH (Rollback)
        if (session) {
            // Reverse wallet deduction
            await session.abortTransaction();
            session.endSession();
        }

        console.error("Cable Purchase Transaction Failed & Rolled back:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message || 'Subscription failed. Your wallet has not been charged.'
        });
    }
};



// src/controllers/vtuController.js

// ... (Keep existing imports) ...

// ... (Keep existing helpers and other controllers) ...


/**
 * @desc    Lookup/Validate Electricity Meter Number
 * @route   GET /api/v1/vtu/lookup/meter?number=XXX&provider=YYY
 * @access  Private
 */
exports.validateMeterNumber = async (req, res) => {
    try {
        // 1. Extract data from Query Parameters (not body, since it's a GET request)
        const { number, provider } = req.query;

        // 2. Basic Validation
        if (!number || !provider) {
            return res.status(400).json({
                status: 'fail',
                message: 'Missing query parameters. Please provide meter "number" and "provider" slug.'
            });
        }

        // 3. Call Service
        // Note: This is a read-only operation, no database transaction needed here.
        const validationResult = await vtuProviderService.validateMeter(number, provider);

        // 4. Send Success Response
        // The service guarantees that if it returns without throwing, it's successful.
        return res.status(200).json({
            status: 'success',
            message: 'Meter validated successfully',
            data: validationResult // { success, customerName, address, meterNumber }
        });

    } catch (error) {
        // 5. Handle Errors
        // Errors here usually mean the meter was invalid, provider didn't recognize it, or network failed.
        // We return 400 Bad Request because the input data provided by the user couldn't be processed.
        return res.status(400).json({
            status: 'error',
            message: error.message // e.g., "Invalid meter number length" or "Meter not found"
        });
    }
};


// second purchase airtime
// Example: src/controllers/vtuController.js

exports.getAirtimeDetails = async (req, res) => {
  try {
    

      const {identifier} = req.query
    const NETWORK_ID ={
    mtn:"1",
    glo:"3",
    airtel:"2",
    '9mobile':"4"
  }

    const networks = await getNetworkProviders();
           // Use the keys 'product' from 'data'
    const networkArray = networks.data?.product || [];

    const formattedNetworks = networkArray.map(net => {
      // Based on your doc sample:
      // net.network is "MTN"
      // net.networkId is 1
      
      return {
        id: net.networkId, 
        // This will result in "mtn", "airtel", etc.
        identifier: net.network.toLowerCase(), 
        // Since Autopilot doesn't provide status here, we default to "up"
        status: "up" 
      };
    });
    const airtimeTypes = await getAirtimeTypes(NETWORK_ID[identifier])

    const airtimeTypeValue = airtimeTypes.data?.product[0].name
    console.log("data-types structure: ", airtimeTypes.data.product)
    // const plansData = await getDataPlans(NETWORK_ID[identifier], dataTypeValue );

      res.status(200).json({
      success: true,
      data: formattedNetworks,
      // identifier:formattedNetworks.identifier,
      airtimeTypes: airtimeTypes.data?.product || [],
      
    });
  } catch (error) {
      console.error("Fetch Networks Error:", error);
      res.status(500).json({ 
      success: false, 
      message: "Error processing network list" 
    });
  }
}

exports.handleAirtimePurchase = async (req, res, next) => {
    console.log('handle airtime func started')
      // const {identifier} = req.query

    const NETWORK_ID ={
    mtn:"1",
    glo:"3",
    airtel:"2",
    '9mobile':"4"
  }
    // These come from the React Native app (via req.body)
    const { phone, amount, selectedNetwork, pin } = req.body; 
    console.log('body', req.body)

    // const networkId= selectedNetwork
    

    // Auth middleware ensures req.user is available
    const userId = req.user.id; 
    
   try {
    
  
      const  User = req.models.User
// 1. Fetch user with the transactionPin field
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 2. Check if Transaction PIN is set
    if (!user.transactionPin || !user.isPinSet) {
      return res.status(403).json({ 
        success: false, 
        message: "Transaction PIN not set. Please set your PIN in Profile settings before transacting.",
        errorCode: "PIN_NOT_SET" 
      });
    }

    // 3. Verify if the provided PIN matches
    // Note: 'pin' is from req.body, 'user.transactionPin' is the hash from DB
    const isMatch = await bcrypt.compare(pin, user.transactionPin);

    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid Transaction PIN. Please try again." 
      });
    }



     } catch (error) {
    console.log('buy airtime error', error)
   }

    let Transaction, Wallet;
    try {
        console.log('about to require models (wrapped)');
        // The problematic lines
        Transaction = req.models.Transaction;
        Wallet = req.models.Wallet;
        console.log('successfully required models'); // Will only hit if successful

    } catch (e) {
        console.error("CRITICAL SYNCHRONOUS ERROR DURING MODEL RETRIEVAL:", e);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error: Model loading failed." 
        });
    }

    // --- 1. Prepare and Reserve Funds (Start Transaction) ---
    const session = await req.dbConnection.startSession();
    session.startTransaction();

    try {
        const amountKobo = amount * 100; // Convert Naira back to kobo for DB storage
        const internalRef = `VTU-${userId}`;

        // (Validation, Wallet check, and initial Transaction creation here...)
        console.log('calling buyairtime from autopilot...')
        // --- 2. Call the AutopilotNG Provider ---
        const vtuResult = await buyAirtime({
            phone,
            amount, // Pass the amount in Naira
            selectedNetwork,
            reference: internalRef,
            airtimeType: 'AWOOF4U', // Assuming VTU is the default airtime type
        });
        
        // --- 3. Finalize DB Transaction ---
        console.log('done purchasing airtime')
        // Update Wallet (Atomic operation, reducing the balance)
        await Wallet.findOneAndUpdate({ user: userId }, { $inc: { balance: -amountKobo } }, { session });
        
        // Update Transaction status
        await Transaction.findOneAndUpdate({ reference: internalRef }, { status: 'SUCCESS', providerRef: vtuResult.providerReference }, { session });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: vtuResult.message,
            transactionReference: internalRef,
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Airtime Purchase Failed:', error);
        next(error); // Pass error to the error middleware
    } finally {
        session.endSession();
    }
};


// buy data controller



// get all networks


exports.fetchNetworks = async (req, res) => {
  const {identifier} = req.query
  const NETWORK_ID ={
  mtn:"1",
  glo:"3",
  airtel:"2",
  '9mobile':"4"
}
  try {
    const networks = await getNetworkProviders();
    // Use the keys 'product' from 'data'
    const networkArray = networks.data?.product || [];

    const formattedNetworks = networkArray.map(net => {
      // Based on your doc sample:
      // net.network is "MTN"
      // net.networkId is 1
      
      const rawName = net.network || "";
      
      return {
        id: net.networkId, 
        name: rawName,
        // This will result in "mtn", "airtel", etc.
        identifier: rawName.toLowerCase(), 
        // Since Autopilot doesn't provide status here, we default to "up"
        status: "up" 
      };
    });
    // console.log("network ID ", formattedNetworks.id)

    const dataTypes = await getDataTypes(NETWORK_ID[identifier])

    const dataTypeValue = dataTypes.data?.product[0].name
console.log("data-types structure: ", dataTypes.data.product)
const plansData = await getDataPlans(NETWORK_ID[identifier], dataTypeValue );

console.log('my data type value', dataTypeValue)

 const allPlans = plansData.data?.product || [];

    // 1. Filter by Status (Only show Active plans)
    // 2. Filter by Data Type (SME, Gifting, etc.) if requested
    const filteredPlans = allPlans.filter(plan => {
      const isActive = plan.ourStatus === "ACTIVE";
      const matchesType = dataTypeValue 
        ? plan.type?.toLowerCase() === dataTypeValue.toLowerCase() 
        : true;
      
      return isActive && matchesType;
    });

    // Map to the frontend format using the specific AutopilotNG keys
    const formattedPlans = filteredPlans.map(plan => ({
      id: plan.planId,           // e.g., "MTN_SME_500MB_30DAYS"
      size: plan.bundle,         // e.g., "500MB"
      name: plan.planName,       // e.g., "500MB [SME] 30DAYS"
      price: plan.ourPrice,      // Use 'ourPrice' as your cost/selling basis
      validity: plan.Validity,   // e.g., "30 days"
      category: plan.type,       // e.g., "SME"
      description: plan.description
    }));

    res.status(200).json({
      success: true,
      data: formattedNetworks,
      // identifier:formattedNetworks.identifier,
      dataTypes: dataTypes.data?.product || [],
      dataPlans:formattedPlans
    });
  } catch (error) {
    console.error("Fetch Networks Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error processing network list" 
    });
  }
};
// controllers/vtuController.js


// fetch dataplan



// controllers/vtuController.js
const { getDataPlans } = require('../services/autopilotVtuProvider');

exports.fetchDataPlans = async (req, res) => {
  try {
    const { networkId} = req.query; 
    const  dataType = 'SME'
    if (!networkId) {
      return res.status(400).json({ 
        success: false, 
        message: "Network ID is required" 
      });
    }

    const plansData = await getDataPlans(networkId, dataType);
    console.log("fetched data plans: ",plansData)
    
    // Access the array from data.product based on your sample
    const allPlans = plansData.data?.product || [];

    // 1. Filter by Status (Only show Active plans)
    // 2. Filter by Data Type (SME, Gifting, etc.) if requested
    const filteredPlans = allPlans.filter(plan => {
      const isActive = plan.ourStatus === "ACTIVE";
      const matchesType = dataType 
        ? plan.type?.toLowerCase() === dataType.toLowerCase() 
        : true;
      
      return isActive && matchesType;
    });

    // Map to the frontend format using the specific AutopilotNG keys
    const formattedPlans = filteredPlans.map(plan => ({
      id: plan.planId,           // e.g., "MTN_SME_500MB_30DAYS"
      size: plan.bundle,         // e.g., "500MB"
      name: plan.planName,       // e.g., "500MB [SME] 30DAYS"
      price: plan.ourPrice,      // Use 'ourPrice' as your cost/selling basis
      validity: plan.Validity,   // e.g., "30 days"
      category: plan.type,       // e.g., "SME"
      description: plan.description
    }));

    res.status(200).json({
      success: true,
      count: formattedPlans.length,
      data: formattedPlans
    });

  } catch (error) {
    console.error("Data Plan Fetch Error:", error.message, error);
    res.status(500).json({
      success: false,
      message: "Could not fetch data plans from provider."
    });
  }
};

const { buyData } = require('../services/autopilotVtuProvider');
const { generateRequestId } = require('../utils/helpers'); // Assuming you have a helper for unique IDs

// Map network names to Autopilot Network IDs
const NETWORK_MAP = {
  'mtn': '1',
  'glo': '2',
  'airtel': '3',
  '9mobile': '4'
};

exports.handleDataPurchase = async (req, res) => {
  const { phone, planId, network, amount, pin } = req.body;
  const  Transaction  = req.models.Transaction;
  const User = req.models.User;

  try {
    // 1. Authenticate User & PIN
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isPinCorrect = await bcrypt.compare(pin, user.transactionPin);
    if (!isPinCorrect) {
      return res.status(401).json({ success: false, message: "Incorrect Transaction PIN" });
    }

    // 2. Check Balance
    if (user.walletBalance < Number(amount)) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    // 3. Deduct Balance (Optimistic Update)
    const oldBalance = user.walletBalance;
    user.walletBalance -= Number(amount);
    await user.save();

    // 4. Call Autopilot API
    const reference = generateRequestId(); // e.g., "DATA-20251220-XYZ"
    
    try {
      const providerResponse = await buyData({
        networkId: NETWORK_MAP[network.toLowerCase()],
        phone,
        planId, // Ensure frontend sends the correct Autopilot Plan ID (e.g., "500")
        reference
      });

      // 5. Create Success Transaction Record
      await Transaction.create({
        userId: user._id,
        type: 'data',
        amount: Number(amount),
        phone,
        network,
        description: `Data Purchase ${network.toUpperCase()} - ${planId}`,
        reference,
        status: 'success',
        providerResponse: providerResponse
      });

      return res.status(200).json({
        success: true,
        data: {
          reference,
          amount,
          phone,
          network,
          newBalance: user.walletBalance
        }
      });

    } catch (providerError) {
      // 6. ROLLBACK: Refund user if provider fails
      user.walletBalance = oldBalance;
      await user.save();

      console.error("Autopilot Data Error:", providerError.response?.data || providerError.message);

      // Log Failed Transaction
      await Transaction.create({
        userId: user._id,
        type: 'data',
        amount: Number(amount),
        phone,
        network,
        description: `Failed Data Purchase`,
        reference,
        status: 'failed',
        metadata: { error: providerError.message }
      });

      // Handle the 424 Configuration error specifically
      if (providerError.response?.status === 424) {
        return res.status(424).json({
          success: false,
          message: "Provider service temporarily unavailable (424). Please try again later."
        });
      }

      return res.status(500).json({
        success: false,
        message: "Data purchase failed. Your wallet has been refunded."
      });
    }

  } catch (error) {
    console.error("System Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};