# Fund Wallet Feature - Testing Guide

## Overview
This guide covers end-to-end testing of the fund wallet feature with the Paystack payment gateway.

## What Was Implemented

### Backend Changes
1. **Fixed webhook controller** (`src/controllers/webhookController.js`)
   - Sends 200 OK immediately to prevent Paystack retries
   - Processes webhook asynchronously in background
   - Implements idempotency check (prevents double-crediting)
   - Updates wallet balance and transaction status atomically

2. **Fixed wallet controller** (`src/controllers/walletController.js`)
   - `initiateFunding`: Creates PENDING transaction, calls Paystack, returns payment URL
   - `verifyFunding`: Verifies payment with Paystack, credits wallet atomically
   - Proper error handling and status responses

3. **Fixed server.js structure**
   - Proper async startup sequence
   - Loads tenant secrets before connecting to tenant DBs
   - Connects all tenant DBs before starting Express server

4. **Verified routes** (`src/routes/userRoutes.js`)
   - `POST /api/v1/user/wallet/fund` → Initiate funding
   - `POST /api/v1/user/wallet/verify` → Verify payment
   - `GET /api/v1/user/wallet/balance` → Get balance

### Frontend Changes
1. **Created API service** (`src/services/api.js`)
   - Centralized axios instance with tenant and auth interceptors
   - Auto-attaches bearer token and x-tenant-id headers
   - Handles 401 errors (token expiration)

2. **Created Redux slices** (`src/redux/slices/`)
   - `authSlice.js`: Authentication state (token, user, tenant)
   - `walletSlice.js`: Wallet state (balance, funding status, transaction ref)

3. **Updated constants** (`src/constants/apiRoutes.js`)
   - Centralized API endpoints
   - Single source of truth for all API routes

4. **Updated FundWalletScreen** (`src/screens/main/FundWalletScreen.jsx`)
   - Uses Redux for state management
   - Integrates with new API service
   - Implements transaction verification flow
   - Persists transaction reference locally
   - Checks for pending transactions on screen load

5. **Updated LoginScreen** (`src/screens/auth/LoginScreen.jsx`)
   - Dispatches Redux login actions
   - Uses new API service

6. **Updated App.js**
   - Wrapped with Redux Provider

7. **Installed dependencies**
   - @reduxjs/toolkit
   - react-redux

## Testing Checklist

### Prerequisites
- [ ] MongoDB is running (locally or Atlas connection working)
- [ ] Paystack sandbox account with test keys configured
- [ ] Backend environment variables set (see `vtu-backend/.env`)
- [ ] npm packages installed in both backend and frontend

### Step 1: Backend Setup
```bash
cd vtu-backend

# Verify .env has required keys:
# - PAYSTACK_SECRET_KEY (sk_test_...)
# - PAYSTACK_PUBLIC_KEY (pk_test_...)
# - DATABASE_URI (MongoDB connection)
# - JWT_SECRET
# - NODE_ENV=development

# Start the backend
npm start  # or: nodemon server.js
```

Expected output:
```
📦 Loading tenant secrets...
🔗 Connecting to tenant databases...
🚀 VTU Server running in development mode on port 5000
```

### Step 2: Frontend Setup
```bash
cd vtu-frontend/vtu_mobile

# Install dependencies
npm install --legacy-peer-deps

# Start Expo
npm start
# or for iOS simulator: npm run ios
```

### Step 3: API Testing (Postman/curl)

#### Create Test User
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: clientA" \
  -d '{
    "email": "testuser@test.com",
    "password": "Test@123456",
    "fullName": "Test User",
    "phone": "08012345678"
  }'
```

#### Login
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: clientA" \
  -d '{
    "emailOrPhone": "testuser@test.com",
    "password": "Test@123456"
  }'
```

Save the returned `token` for next requests.

#### Check Wallet Balance
```bash
curl -X GET http://localhost:5000/api/v1/user/wallet/balance \
  -H "Authorization: Bearer {TOKEN}" \
  -H "x-tenant-id: clientA"
```

Expected response:
```json
{
  "status": "success",
  "data": {
    "balance": 0,
    "currency": "NGN"
  }
}
```

#### Initiate Funding
```bash
curl -X POST http://localhost:5000/api/v1/user/wallet/fund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "x-tenant-id: clientA" \
  -d '{
    "amount": 1000
  }'
```

Expected response:
```json
{
  "status": "success",
  "message": "Funding initiated. Proceed to payment gateway.",
  "data": {
    "transactionReference": "uuid-here",
    "amountToPay": 1000,
    "paymentUrl": "https://checkout.paystack.com/..."
  }
}
```

#### Verify Funding (After Payment)
```bash
curl -X POST http://localhost:5000/api/v1/user/wallet/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "x-tenant-id: clientA" \
  -d '{
    "reference": "uuid-from-initiate-response"
  }'
```

### Step 4: Frontend E2E Test

1. **Launch the app** in iOS simulator
2. **Register** a new account
3. **Login** with created credentials
4. **Navigate** to "Fund Wallet" screen
5. **Enter amount** (use test amounts like 1000)
6. **Click** "Pay" button
7. **Verify** payment in Paystack sandbox interface
8. **Complete** payment in browser
9. **Check** wallet balance updated

### Step 5: Webhook Testing (Local with ngrok)

For local testing of webhook, use ngrok to expose your localhost:

```bash
# Install ngrok if not already
brew install ngrok  # macOS

# Start ngrok tunnel
ngrok http 5000

# Get the public URL (e.g., https://abc123.ngrok.io)

# Update Paystack webhook URL in dashboard:
# https://abc123.ngrok.io/api/v1/webhooks/paystack
```

Then when payment completes, Paystack will call your webhook and automatically credit the wallet.

Check logs to verify:
```bash
# Backend logs should show:
✅ Webhook SUCCESS: Wallet funded ₦1000 for user...
```

## Troubleshooting

### "Cannot connect to MongoDB"
- Ensure MongoDB is running
- Check DATABASE_URI in `.env`
- Verify network access if using Atlas

### "Transaction not found" during verify
- Ensure funding was initiated first
- Check transaction reference is correct
- Verify tenant ID matches

### "Amount paid is less than requested"
- Paystack test transaction succeeded at different amount
- Use exact amount in verification

### "Token expired" on verify
- Token expires after 1 day (JWT_EXPIRES_IN=1d)
- Re-login to get new token

### Webhook not being called
- Verify ngrok tunnel is active
- Check Paystack webhook URL in dashboard
- Monitor ngrok dashboard for requests

### Double-crediting issue
- Fixed with idempotency check in webhook
- Verify transaction status is checked before processing

## Key Features Implemented

✅ **Atomic transactions** - No partial updates  
✅ **Idempotency** - Webhook can be retried safely  
✅ **Transaction tracking** - PENDING → SUCCESS status flow  
✅ **Redux state management** - Consistent frontend state  
✅ **API interceptors** - Auto-attach auth headers  
✅ **Error handling** - Detailed error messages  
✅ **Unit conversion** - Consistent Kobo/Naira handling  
✅ **Local persistence** - Transaction reference saved locally  
✅ **Graceful shutdown** - SIGTERM handling  

## Performance Considerations

- **Webhook async processing**: Returns 200 OK immediately, processes in background
- **Connection pooling**: Mongoose maintains connection pool
- **DB transactions**: Uses MongoDB sessions for atomicity
- **Timeout settings**: 15s for API calls, 45s socket timeout

## Next Steps

1. **Set up CI/CD** for automatic testing
2. **Configure production Paystack keys** before deployment
3. **Monitor webhook failures** and implement retry queue
4. **Add wallet transaction history** UI screen
5. **Implement transaction receipt** generation
6. **Add payment method** selection (Paystack vs Flutterwave)
