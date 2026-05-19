import React, { createContext, useState, useContext, useCallback } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
// import { token } from 'morgan';

const API_URL = Platform.OS === 'android' ? 'https://vtu-project.vercel.app' : 'https://vtu-project.vercel.app';

// 1. Define the Context
export const UserContext = createContext(null);

// 2. Define the Provider Component
export const UserProvider = ({ children }) => {
  // --- Global State ---
  const [userToken, setUserToken] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [wallet, setWallet] = useState(null);

  // --- Core Functions ---

  /**
   * @desc Handles storing credentials after successful login/register.
   */
  const login = useCallback(async (token, user, wallet, id) => {
    setUserToken(token);
    setTenantId(id);
    setUserProfile(user);
    setWallet(wallet);
    // await AsyncStorage.setItem('user', user)
    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('tenantId', id);
    setIsLoading(false);
  }, [userToken]);

  /**
   * @desc Fetches the dashboard data (user and wallet) from the backend.
   */
  const fetchDashboardData = useCallback(async () => {
    if (!userToken || !tenantId) {
      setError("Authentication failed. Please log in.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `${API_URL}/api/v1/user/dashboard/data`,
        {
          headers: {
            'x-tenant-id': tenantId,
            'Authorization': `Bearer ${userToken}`,
          },
        }
      );
      console.log('wallet data',response.data.data.wallet)
      setUserProfile(response.data.user);
      setWallet(response.data.wallet);
      
    } catch (err) {
      console.error("Dashboard Fetch Error:", err.response?.data || err.message);
      setError("Failed to load dashboard data.");
      
      // If unauthorized, trigger logout
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setIsLoading(false);
    }
  }, [userToken, tenantId]);


  /**
   * @desc Logs the user out and clears all data.
   */
  const logout = useCallback(async () => {
    setUserToken(null);
    setTenantId(null);
    setUserProfile(null);
    setWallet(null);
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('tenantId');
  }, []);
  
  /**
   * @desc Updates the wallet balance after a successful local transaction.
   */
  const updateWalletBalance = useCallback((newBalance) => {
    setWallet(prevWallet => ({
      ...prevWallet,
      balance: newBalance,
    }));
  }, []);


  // --- Context Value ---
  const contextValue = {
    // Auth & Identity
    userToken,
    tenantId,
    isLoggedIn: !!userToken,
    isLoading,
    error,
    
    // Data
    userProfile,
    wallet,
    
    // Actions
    login,
    logout,
    fetchDashboardData,
    updateWalletBalance,
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

// 3. Custom Hook to use the Context
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};