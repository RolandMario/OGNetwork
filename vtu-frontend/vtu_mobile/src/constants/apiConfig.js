// src/constants/apiConfig.js
//
// Centralized API base URL configuration.
//
// Priority:
//   1. EXPO_PUBLIC_API_URL env var (set in .env or in Vercel/EAS build)
//   2. Development default:
//        - iOS Simulator     → http://localhost:5001
//        - Android Emulator  → http://10.0.2.2:5001
//        - Physical device   → set EXPO_PUBLIC_API_URL to your machine's LAN IP
//   3. Production default   → https://og-network-backend.vercel.app
//
// Usage in .env file (optional):
//   EXPO_PUBLIC_API_URL=http://localhost:5001        # local dev
//   EXPO_PUBLIC_API_URL=https://og-network-backend.vercel.app   # production

import { Platform } from 'react-native';

// Explicit env var (from .env / EAS / CI) — highest priority.
const envUrl = process.env.EXPO_PUBLIC_API_URL;

// Production default — used when __DEV__ is false and no env var is set.
const PROD_URL = 'https://og-network-backend.vercel.app';

// Development fallbacks — used when __DEV__ is true and no env var is set.
const DEV_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:5001'
  : 'http://localhost:5001';

/**
 * Returns the base API URL (no trailing slash).
 * Includes /api/v1 suffix for convenience.
 */
function getApiBaseUrl() {
  const raw = envUrl || (__DEV__ ? DEV_URL : PROD_URL);
  return raw.replace(/\/+$/, '');
}

/**
 * Full API root: e.g. http://localhost:5001/api/v1
 */
export const API_BASE_URL = getApiBaseUrl();
export const API_ROOT = `${API_BASE_URL}/api/v1`;

export default API_BASE_URL;