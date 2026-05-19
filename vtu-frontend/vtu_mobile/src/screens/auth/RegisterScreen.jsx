import React, { useState } from 'react';
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
  StatusBar,
  
} from 'react-native';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';

const RegisterScreen = ({ navigation }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);


  // --- CONFIGURATION ---
  // If Android Emulator: use 'http://10.0.2.2:5000'
  // If iOS Simulator: use 'http://localhost:5000'
  // If Physical Device: use 'http://YOUR_PC_IP:5000'
  const API_URL = Platform.OS === 'android' 
    ? 'https://vtu-project.vercel.app/api/v1/auth/register' 
    : 'https://vtu-project.vercel.app/api/v1/auth/register';

  // The ID of the tenant you want to connect to
  const TENANT_ID = 'clientA'; 

  const handleRegister = async () => {
    // 1. Basic Validation
    if (!fullName || !email || !phone || !password) {
      Alert.alert('Missing Info', 'Please fill in all fields to continue.');
      return;
    }

    setIsLoading(true);

    try {
      // 2. Make the API Request
      const response = await axios.post(
        API_URL, 
        {
          fullName,
          email,
          phone,
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

      // 4. Handle Success
      // Assuming your backend returns { status: 'success', ... }
      if (response.data.status === 'success') {
        Alert.alert(
          'Registration Successful', 
          'Your account has been created. Please log in.',
          [
            { text: 'OK', onPress: () => navigation.navigate('Login') }
          ]
        );
      }

    } catch (error) {
      // 5. Handle Errors
      console.error(error);
      
      let errorMessage = 'Something went wrong. Please try again.';
      
      // Extract message from backend response if available
      if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Registration Failed', errorMessage);
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
            {/* Optional Back button if not the very first screen */}
             <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                 <Text style={styles.backButtonText}>← Back to Login</Text>
             </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>Start your journey to seamless VTU.</Text>
          </View>

          {/* Form Section - White Card */}
          <View style={styles.formCard}>
            <CustomInput
              label="Full Name"
              placeholder="John Doe"
              value={fullName}
              onChangeText={setFullName}
            />
             <CustomInput
              label="Phone Number"
              placeholder="08012345678"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <CustomInput
              label="Email Address"
              placeholder="john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <CustomInput
              label="Password"
              placeholder="Create secure password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
             {/* A confirm password field should also be here in production */}

            <View style={{ marginTop: SIZES.padding }}>
                <CustomButton
                label="Create My Account"
                onPress={handleRegister}
                isLoading={isLoading}
                variant="primary"
                />
            </View>

            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.footerActionText}>Sign In</Text>
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
    backgroundColor: COLORS.primary,
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
    paddingTop: SIZES.padding * 1,
    paddingBottom: SIZES.padding * 3,
    justifyContent: 'flex-end',
  },
  backButton: {
      marginBottom: SIZES.padding,
  },
  backButtonText: {
      ...FONTS.medium,
      color: COLORS.textWhite,
      opacity: 0.8
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
    marginTop: -SIZES.padding,
    ...SHADOWS.medium,
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SIZES.padding,
    marginBottom: SIZES.padding * 2,
  },
  footerText: {
    ...FONTS.regular,
    color: COLORS.textSecondary,
    fontSize: SIZES.body1,
  },
  footerActionText: {
    ...FONTS.bold,
    color: COLORS.primary,
    fontSize: SIZES.body1,
  },
});

export default RegisterScreen;