import axios from 'axios';
import { API_ROOT } from '../constants/apiConfig';
import { getSession, clearSession } from './session';

export const apiClient = axios.create({
  baseURL: API_ROOT,
  // Generous timeout to handle Vercel serverless cold starts.
  // First request after idle can take 20-40s (Node boot + MongoDB connection).
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': 'demo',
  },
});

// Request interceptor: Attach auth token and tenant ID
// The session lives in-memory only (services/session.js) — the token is never
// persisted to disk, so closing the app always requires a fresh login.
apiClient.interceptors.request.use(
  (config) => {
    const { token, tenantId } = getSession();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (tenantId) {
      config.headers['x-tenant-id'] = tenantId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401 (token expired/invalid)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Clear the in-memory session when the token is rejected/expired
    if (error.response?.status === 401) {
      clearSession();
    }
    return Promise.reject(error);
  }
);

export default apiClient;