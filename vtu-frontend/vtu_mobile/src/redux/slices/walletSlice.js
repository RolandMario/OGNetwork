import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  balance: 0,
  currency: 'NGN',
  isLoading: false,
  error: null,
  lastUpdated: null,
  
  // Funding-specific state
  fundingState: {
    isPending: false,
    transactionRef: null, // Track the transaction reference while funding
    amount: null,
    paymentUrl: null,
    status: null, // 'pending', 'success', 'failed'
  },
};

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    // Action: Fetch balance started
    fetchBalanceStart: (state) => {
      state.isLoading = true;
      state.error = null;
    },
    // Action: Fetch balance success
    fetchBalanceSuccess: (state, action) => {
      const { balance, currency } = action.payload;
      state.balance = balance;
      state.currency = currency || 'NGN';
      state.lastUpdated = new Date().toISOString();
      state.isLoading = false;
      state.error = null;
    },
    // Action: Fetch balance failed
    fetchBalanceFail: (state, action) => {
      state.isLoading = false;
      state.error = action.payload;
    },
    
    // Funding actions
    // Action: Initiate funding started
    initiateFundingStart: (state) => {
      state.fundingState.isPending = true;
      state.error = null;
    },
    // Action: Initiate funding success (wallet fund endpoint called, got payment URL)
    initiateFundingSuccess: (state, action) => {
      const { transactionRef, amount, paymentUrl } = action.payload;
      state.fundingState.transactionRef = transactionRef;
      state.fundingState.amount = amount;
      state.fundingState.paymentUrl = paymentUrl;
      state.fundingState.status = 'pending';
      state.fundingState.isPending = false;
      state.error = null;
    },
    // Action: Initiate funding failed
    initiateFundingFail: (state, action) => {
      state.fundingState.isPending = false;
      state.fundingState.status = 'failed';
      state.error = action.payload;
    },
    
    // Action: Verify funding success
    verifyFundingSuccess: (state, action) => {
      const { newBalance } = action.payload;
      state.balance = newBalance;
      state.fundingState.status = 'success';
      state.fundingState.transactionRef = null; // Clear after success
      state.lastUpdated = new Date().toISOString();
      state.error = null;
    },
    // Action: Verify funding failed
    verifyFundingFail: (state, action) => {
      state.fundingState.status = 'failed';
      state.error = action.payload;
    },
    
    // Action: Reset funding state
    resetFundingState: (state) => {
      state.fundingState = {
        isPending: false,
        transactionRef: null,
        amount: null,
        paymentUrl: null,
        status: null,
      };
    },
    
    // Action: Update balance (for quick local updates)
    updateBalance: (state, action) => {
      state.balance = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
  },
});

export const {
  fetchBalanceStart,
  fetchBalanceSuccess,
  fetchBalanceFail,
  initiateFundingStart,
  initiateFundingSuccess,
  initiateFundingFail,
  verifyFundingSuccess,
  verifyFundingFail,
  resetFundingState,
  updateBalance,
} = walletSlice.actions;

export default walletSlice.reducer;
