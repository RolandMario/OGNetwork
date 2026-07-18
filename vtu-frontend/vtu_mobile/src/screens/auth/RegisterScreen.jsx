import React, { useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import { loginSuccess } from '../../redux/slices/authSlice';

const TENANT_ID = 'demo';

const RegisterScreen = ({ navigation }) => {
  const dispatch = useDispatch();

  const [fullName,  setFullName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [password,  setPassword]  = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !phone || !password) {
      Alert.alert('Missing Info', 'Please fill in all fields to continue.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiClient.post(API_ROUTES.AUTH.REGISTER, {
        fullName,
        email,
        phone,
        password,
      });

      if (response.data.status === 'success') {
        const { token, data: { user } } = response.data;

        // 1. Persist token and tenantId so interceptor picks them up
        await AsyncStorage.setItem('token', token);
        await AsyncStorage.setItem('tenantId', TENANT_ID);

        // 2. Update Redux auth state
        dispatch(loginSuccess({ token, user, tenantId: TENANT_ID }));

        // 3. Go straight to SetPin — user must set PIN before purchasing
        //    Use 'replace' so the back button doesn't return to Register
        navigation.replace('SetPin');
      }

    } catch (error) {
      console.error('[Register] error:', error.response?.data || error.message);
      const msg =
        error.response?.data?.message ||
        error.message ||
        'Something went wrong. Please try again.';
      Alert.alert('Registration Failed', msg);
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

          {/* Header */}
          <View style={styles.headerSection}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back to Login</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>Start your journey to seamless VTU.</Text>
          </View>

          {/* Form */}
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
              placeholder="Create a secure password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

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
  safeArea:       { flex: 1, backgroundColor: COLORS.primary },
  container:      { flex: 1 },
  scrollContent:  { flexGrow: 1 },
  headerSection:  { backgroundColor: COLORS.primary, paddingHorizontal: SIZES.padding, paddingTop: SIZES.padding, paddingBottom: SIZES.padding * 3, justifyContent: 'flex-end' },
  backButton:     { marginBottom: SIZES.padding },
  backButtonText: { ...FONTS.medium, color: COLORS.textWhite, opacity: 0.8 },
  headerTitle:    { ...FONTS.bold, fontSize: SIZES.h1, color: COLORS.textWhite, marginBottom: 8 },
  headerSubtitle: { ...FONTS.regular, fontSize: SIZES.body1, color: 'rgba(255,255,255,0.7)' },
  formCard:       { flex: 1, backgroundColor: COLORS.backgroundMain, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: SIZES.padding, paddingTop: SIZES.padding * 2, marginTop: -SIZES.padding, ...SHADOWS.medium },
  footerContainer:{ flexDirection: 'row', justifyContent: 'center', marginTop: SIZES.padding, marginBottom: SIZES.padding * 2 },
  footerText:     { ...FONTS.regular, color: COLORS.textSecondary, fontSize: SIZES.body1 },
  footerActionText:{ ...FONTS.bold, color: COLORS.primary, fontSize: SIZES.body1 },
});

export default RegisterScreen;