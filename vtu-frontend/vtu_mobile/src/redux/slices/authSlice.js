import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
  token: null,
  tenantId: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Action: Login started
    loginStart: (state) => {
      state.isLoading = true;
      state.error = null;
    },
    // Action: Login success
    loginSuccess: (state, action) => {
      const { token, user, tenantId } = action.payload;
      state.token = token;
      state.user = user;
      state.tenantId = tenantId;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
    },
    // Action: Login failed
    loginFail: (state, action) => {
      state.isLoading = false;
      state.error = action.payload;
      state.isAuthenticated = false;
    },
    // Action: Logout
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.tenantId = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    // Action: Clear error
    clearError: (state) => {
      state.error = null;
    },
    // Action: Restore auth from storage (on app startup)
    restoreAuth: (state, action) => {
      const { token, user, tenantId } = action.payload;
      if (token) {
        state.token = token;
        state.user = user;
        state.tenantId = tenantId;
        state.isAuthenticated = true;
      }
      state.isLoading = false;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFail,
  logout,
  clearError,
  restoreAuth,
} = authSlice.actions;

export default authSlice.reducer;
