// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as ReduxProvider } from 'react-redux';
import AppNavigator from './src/navigation/AppNavigator'
import { UserProvider } from './src/context/userContext';
import store from './src/redux/store';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <ReduxProvider store={store}>
      <UserProvider>
        <NavigationContainer>
          <AppNavigator/>
        </NavigationContainer>  
      </UserProvider>
    </ReduxProvider>
  );
};

export default App;