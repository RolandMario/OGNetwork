// src/navigation/navigationRef.js
//
// A module-level navigation ref that can be used from anywhere in the app
// (e.g. the auto-logout hook) to inspect/reset the root navigation state,
// even outside the NavigationContainer's tree.

import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export default navigationRef;