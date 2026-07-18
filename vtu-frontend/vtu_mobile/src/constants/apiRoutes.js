// src/constants/apiRoutes.js

export const API_ROUTES = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN:    '/auth/login',
    ME:       '/auth/me',
  },
  USER: {
    DASHBOARD:          '/user/dashboard/data',
    SET_PIN:            '/user/set-transaction-pin',
    UPDATE_PIN:         '/user/update-transaction-pin',
    UPDATE_PROFILE:     '/user/profile/update',
    UPDATE_PASSWORD:    '/user/update-password',
    TRANSACTION_HISTORY:'/user/transactions/my-history',
  },
  WALLET: {
    GET_BALANCE:      '/user/wallet/balance',
    FUND:             '/user/wallet/fund',
    VERIFY:           '/user/wallet/verify',
    ACCOUNT_DETAILS:  '/user/wallet/account-details',
    PROVISION_ACCOUNT:'/user/wallet/provision-account',
  },
  VTU: {
    // DB plans endpoint — returns ourPrice for all services
    PLANS: '/vtu/plans',

    // Airtime
    AIRTIME_NETWORKS: '/vtu/airtime/networks',
    BUY_AIRTIME:      '/vtu/airtime/buy',

    // Data (kept for fallback if needed)
    DATA_NETWORKS: '/vtu/data/networks',
    DATA_PLANS:    '/vtu/data/plans',
    BUY_DATA:      '/vtu/data/buy',

    // Cable
    CABLE_PROVIDERS: '/vtu/cable/providers',
    CABLE_PLANS:     '/vtu/cable/plans',
    CABLE_VERIFY:    '/vtu/cable/verify',
    CABLE_SUBSCRIBE: '/vtu/cable/subscribe',

    // Electricity
    ELECTRICITY_PLANS:  '/vtu/electricity/plans',
    ELECTRICITY_VERIFY: '/vtu/electricity/verify',
    BUY_ELECTRICITY:    '/vtu/electricity/buy',
  },
};