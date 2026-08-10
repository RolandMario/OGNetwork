// src/hooks/useAutoLogout.js
//
// Ends the user's session whenever the app leaves the foreground (i.e. the
// app "closes"), and sends the user back to the Login screen on reopen.
//
//   1. On AppState -> 'background'  : log out immediately (clears the
//      in-memory session). This covers pressing Home, the app switcher, the
//      screen turning off, etc.
//   2. On return to 'active'        : if there is no session, reset the
//      navigation stack to the Login screen.
//
// If the OS hard-kills the process while backgrounded (e.g. swiping the app
// away), this listener may never run — but because the session lives in
// memory only (services/session.js), a fresh cold start always lands on the
// Login screen anyway.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useUser } from '../context/userContext';
import { getSession } from '../services/session';
import { navigationRef } from '../navigation/navigationRef';

// Screens that never require a session and should NOT be force-reset.
const AUTH_ROUTES = ['Splash', 'Login', 'Register'];

const useAutoLogout = () => {
  const { logout } = useUser();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // ---- App is closing / being backgrounded -> end the session ----
      if (nextState === 'background') {
        console.log('[AutoLogout] App went to background — logging out.');
        logout();
        return;
      }

      // ---- App is back in the foreground -> require login if needed ----
      if (nextState === 'active') {
        const { token } = getSession();
        if (token) return; // still authenticated

        if (navigationRef.isReady()) {
          const currentRoute = navigationRef.getCurrentRoute()?.name;
          if (currentRoute && !AUTH_ROUTES.includes(currentRoute)) {
            console.log('[AutoLogout] No session on foreground — redirecting to Login.');
            navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
          }
        }
      }
    });

    return () => subscription.remove();
  }, [logout]);
};

export default useAutoLogout;