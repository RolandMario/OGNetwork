// src/hooks/useAutoLogout.js
//
// Ends the user's session after the app has been backgrounded (minimized)
// for 3 continuous minutes, and sends the user back to the Login screen.
//
// Behavior:
//   1. App goes to background (Home button / app switcher / screen off):
//      a 3-minute inactivity timer starts. If the user returns BEFORE the
//      3 minutes elapse, the timer is cancelled and the session is kept.
//      If the app stays backgrounded for 3+ minutes, the session is ended
//      (logout) so the next time the app is opened a fresh login is needed.
//   2. While the app stays in the foreground, nothing is done — the session
//      is always maintained ("the app should maintain the session").
//   3. On return to 'active': if there is no session (e.g. the 3-minute timer
//      already fired), reset the navigation stack to the Login screen.
//
// If the OS hard-kills the process while backgrounded (e.g. swiping the app
// away), this listener may never run — but because the session lives in
// memory only (services/session.js), a fresh cold start always lands on the
// Login screen anyway.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useUser } from '../context/userContext';
import { getSession } from '../services/session';
import { navigationRef } from '../navigation/navigationRef';

// Screens that never require a session and should NOT be force-reset.
const AUTH_ROUTES = ['Splash', 'Login', 'Register'];

// Max time the app may stay backgrounded before the session is invalidated.
const BACKGROUND_LOGOUT_MS = 3 * 60 * 1000; // 3 minutes

const useAutoLogout = () => {
  const { logout } = useUser();

  // Holds the timeout id for the backgrounded-app timer so it can be
  // cancelled if the user returns within the 3-minute grace period.
  const backgroundTimerRef = useRef(null);

  useEffect(() => {
    const clearBackgroundTimer = () => {
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      // ---- App is being minimized -> start the 3-minute expiry timer ----
      if (nextState === 'background') {
        const { token } = getSession();
        if (!token) return; // not logged in — nothing to expire

        // Guard against duplicate 'background' events from the OS.
        clearBackgroundTimer();

        backgroundTimerRef.current = setTimeout(() => {
          console.log('[AutoLogout] App backgrounded for 3+ minutes — logging out.');
          backgroundTimerRef.current = null;
          logout();
        }, BACKGROUND_LOGOUT_MS);

        return;
      }

      // ---- App is back in the foreground ----
      if (nextState === 'active') {
        // Returning within the grace period -> the session stays alive.
        clearBackgroundTimer();

        const { token } = getSession();
        if (token) return; // still authenticated — maintain the session

        // No session (the 3-minute timer fired or session was already gone):
        // force the user back to Login.
        if (navigationRef.isReady()) {
          const currentRoute = navigationRef.getCurrentRoute()?.name;
          if (currentRoute && !AUTH_ROUTES.includes(currentRoute)) {
            console.log('[AutoLogout] No session on foreground — redirecting to Login.');
            navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
          }
        }
      }
    });

    return () => {
      subscription.remove();
      clearBackgroundTimer();
    };
  }, [logout]);
};

export default useAutoLogout;