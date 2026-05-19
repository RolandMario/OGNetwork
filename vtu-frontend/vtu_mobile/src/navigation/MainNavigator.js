import React from 'react';
import { View, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Import Screens
import HomeScreen from '../screens/main/HomeScreen';
import TransactionHistoryScreen from '../screens/main/TransactionHistoryScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

// Import Theme
import { COLORS, SHADOWS, FONTS } from '../constants/theme';

const Tab = createBottomTabNavigator();

const MainNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false, // We handle headers inside the screens
        tabBarShowLabel: true, // Show text labels
        
        // --- 1. Colors ---
        tabBarActiveTintColor: COLORS.accent, // Teal for active
        tabBarInactiveTintColor: COLORS.textSecondary, // Grey for inactive
        
        // --- 2. Bar Style (The container) ---
        tabBarStyle: {
          backgroundColor: COLORS.surfaceWhite,
          height: Platform.OS === 'ios' ? 85 : 70, // Taller for modern look
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
          borderTopWidth: 0, // Remove default ugly line
          elevation: 10, // Android shadow
          shadowColor: '#000', // iOS Shadow
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
        },

        // --- 3. Label Style ---
        tabBarLabelStyle: {
          ...FONTS.medium,
          fontSize: 12,
        },

        // --- 4. Icon Logic ---
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Transactions') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          // Return the icon component
          return (
            <View style={{ alignItems: 'center', justifyContent: 'center', top: 3 }}>
              <Ionicons name={iconName} size={24} color={color} />
              {/* Optional: Add a small dot if focused for extra style
              {focused && (
                <View style={{
                  width: 4, height: 4, borderRadius: 2, backgroundColor: color, marginTop: 2
                }} />
              )} */}
            </View>
          );
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{ tabBarLabel: 'Home' }}
      />
      
      <Tab.Screen 
        name="Transactions" 
        component={TransactionHistoryScreen} 
        options={{ tabBarLabel: 'History' }}
      />
      
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ tabBarLabel: 'Profile' }}
      />
      
    </Tab.Navigator>
  );
};

export default MainNavigator;