import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ROOT } from '../constants/apiConfig';

export const apiClient = axios.create({
  baseURL: API_ROOT,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': 'demo',
  },
});

// Request interceptor: Attach auth token and tenant ID
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token    = await AsyncStorage.getItem('token');      // FIX: was 'userToken'
      const tenantId = await AsyncStorage.getItem('tenantId');

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (tenantId) {
        config.headers['x-tenant-id'] = tenantId;
      }
    } catch (error) {
      console.error('[API] Request interceptor error:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401 (token expired/invalid)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('token');       // FIX: was 'userToken'
      await AsyncStorage.removeItem('tenantId');
    }
    return Promise.reject(error);
  }
);

export default apiClient;