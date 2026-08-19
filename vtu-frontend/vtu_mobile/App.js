// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as ReduxProvider } from 'react-redux';
import AppNavigator from './src/navigation/AppNavigator'
import { UserProvider } from './src/context/userContext';
import { navigationRef } from './src/navigation/navigationRef';
import useAutoLogout from './src/hooks/useAutoLogout';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import store from './src/redux/store';

const Stack = createNativeStackNavigator();

// Small helper so the auto-logout hook (which needs UserContext) can be
// mounted inside <UserProvider>. It renders nothing.
const AutoLogoutHandler = () => {
  useAutoLogout();
  return null;
};

const App = () => {
  return (
    <SafeAreaProvider>
      <ReduxProvider store={store}>
        <UserProvider>
          <AutoLogoutHandler />
          <NavigationContainer ref={navigationRef}>
            <AppNavigator/>
          </NavigationContainer>
        </UserProvider>
      </ReduxProvider>
    </SafeAreaProvider>
  );
};

export default App;