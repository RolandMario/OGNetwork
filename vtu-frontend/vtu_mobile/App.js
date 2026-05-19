// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppNavigator from './src/navigation/AppNavigator'
import { UserProvider } from './src/context/userContext';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <UserProvider>

        <NavigationContainer>
          <AppNavigator/>
        </NavigationContainer>  
            
    </UserProvider>

  );
};

export default App;