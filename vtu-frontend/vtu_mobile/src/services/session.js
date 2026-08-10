// src/services/session.js
//
// In-memory session store.
//
// The session deliberately lives ONLY in memory and is never written to
// AsyncStorage / disk. This means the session automatically dies whenever
// the app process is closed or killed, so every time the app is opened the
// user must log in again.

let session = {
  token: null,
  tenantId: null,
};

export const getSession = () => ({ ...session });

export const setSession = (token, tenantId) => {
  session = {
    token: token ?? null,
    tenantId: tenantId ?? null,
  };
};

export const updateToken = (token) => {
  session = {
    ...session,
    token: token ?? null,
  };
};

export const clearSession = () => {
  session = {
    token: null,
    tenantId: null,
  };
};

export default { getSession, setSession, updateToken, clearSession };