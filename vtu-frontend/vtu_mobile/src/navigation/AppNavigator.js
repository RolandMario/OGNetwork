import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Main Container (This now holds Home, History, Profile)
import MainNavigator from './MainNavigator'; // <--- Import the Tabs

// Feature Screens (These sit on top of the tabs)
import FundWalletScreen from '../screens/main/FundWalletScreen';
import BuyAirtimeScreen from '../screens/main/BuyAirtimeScreen';
import BuyDataScreen from '../screens/main/BuyDataScreen';
import BuyCableScreen from '../screens/main/BuyCableScreen';
import BuyElectricityScreen from '../screens/main/BuyElectricityScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import UpdatePinScreen from '../screens/main/UpdatePinScreen';
import SetupPinScreen from '../screens/main/SetupPinScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      
      {/* Auth Stack */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      
      {/* The Main App Flow 
         Instead of 'Home', we navigate to 'MainNavigator' 
      */}
      <Stack.Screen name="MainNavigator" component={MainNavigator} />

      {/* Inner Feature Screens 
         These are kept outside the Tab Navigator so that when you open them, 
         the bottom tabs hide (standard mobile behavior).
      */}
      <Stack.Screen name="FundWallet" component={FundWalletScreen} />
      <Stack.Screen name="BuyAirtime" component={BuyAirtimeScreen} />
      <Stack.Screen name="BuyData" component={BuyDataScreen} />
      <Stack.Screen name="BuyCable" component={BuyCableScreen} />
      <Stack.Screen name="BuyElectricity" component={BuyElectricityScreen} />


      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="UpdatePin" component={UpdatePinScreen} />
      <Stack.Screen name="SetPin" component={SetupPinScreen} />
      
    </Stack.Navigator>
  );
};

export default AppNavigator;