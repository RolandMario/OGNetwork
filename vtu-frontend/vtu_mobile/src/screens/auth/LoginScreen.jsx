import React, { useState } from 'react';
// import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../../context/userContext';
import axios from 'axios';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar
} from 'react-native';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
 const {login} = useUser()
// --- CONFIGURATION ---
  // Ensure this matches your backend setup
  const API_URL = Platform.OS === 'android' 
    ? 'https://vtu-project.vercel.app/api/v1/auth/login' 
    : 'https://vtu-project.vercel.app/api/v1/auth/login';
  // The ID of the tenant you are testing against
  const TENANT_ID = 'clientA'; 

  const handleLogin = async () => {
    // 1. Basic Validation
    if (!email || !password) {
      Alert.alert('Missing Credentials', 'Please enter both email and password.');
      return;
    }
    
    setIsLoading(true);

    try {
      // 2. Make the API Request
      const response = await axios.post(
        API_URL, 
        {
          emailOrPhone:email,
          password
        },
        {
          // 3. CRITICAL: Pass the Tenant ID in headers
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID 
          }
        }
      );

      console.log('response', response.data.data.user)
      // Use the context function to update global state and AsyncStorage
        
      // 4. Handle Success
      if (response.data.status === 'success') {
        const token = response.data.token;
        const user = response.data.data.user
        await login(token, user, null, TENANT_ID);
        // Store the JWT token securely for future API calls
        // await AsyncStorage.setItem('userToken', token);
        
        Alert.alert('Login Successful', 'Welcome to your wallet!');
        // Replace current screen with the main application flow
        navigation.replace('MainNavigator'); 
      }

    } catch (error) {
      // 5. Handle Errors
      console.error('Login Error:', error);
      
      let errorMessage = 'Login failed due to a server error.';
      
      if (error.response && error.response.data && error.response.data.message) {
        // Capture specific backend error (e.g., 'Invalid credentials' or 'Account suspended')
        errorMessage = error.response.data.message;
      }

      Alert.alert('Login Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Header Section - Navy Background */}
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>Welcome Back!</Text>
            <Text style={styles.headerSubtitle}>Sign in to continue to your wallet.</Text>
          </View>

          {/* Form Section - White Card */}
          <View style={styles.formCard}>
            <CustomInput
              label="Email Address"
              placeholder="john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <CustomInput
              label="Password"
              placeholder="Your secure password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              keyboardType="numeric"
            />

            <TouchableOpacity style={styles.forgotPasswordContainer}>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <CustomButton
              label="Secure Login"
              onPress={handleLogin}
              isLoading={isLoading}
              variant="primary" // Uses the Teal accent color
            />

            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.footerActionText}>Register Now</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary, // Top half navy
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerSection: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SIZES.padding,
    paddingTop: SIZES.padding * 2,
    paddingBottom: SIZES.padding * 3,
    justifyContent: 'flex-end',
  },
  headerTitle: {
    ...FONTS.bold,
    fontSize: SIZES.h1,
    color: COLORS.textWhite,
    marginBottom: 8,
  },
  headerSubtitle: {
    ...FONTS.regular,
    fontSize: SIZES.body1,
    color: 'rgba(255,255,255,0.7)',
  },
  formCard: {
    flex: 1,
    backgroundColor: COLORS.backgroundMain,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: SIZES.padding,
    paddingTop: SIZES.padding * 2,
    marginTop: -SIZES.padding, // Overlap the header slightly
    ...SHADOWS.medium, // Subtle shadow where card meets header
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginBottom: SIZES.padding,
  },
  forgotPasswordText: {
    ...FONTS.medium,
    color: COLORS.primary,
    fontSize: SIZES.body2,
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SIZES.padding,
    marginBottom: SIZES.padding,
  },
  footerText: {
    ...FONTS.regular,
    color: COLORS.textSecondary,
    fontSize: SIZES.body1,
  },
  footerActionText: {
    ...FONTS.bold,
    color: COLORS.primary, // Or use accent color here depending on preference
    fontSize: SIZES.body1,
  },
});

export default LoginScreen;