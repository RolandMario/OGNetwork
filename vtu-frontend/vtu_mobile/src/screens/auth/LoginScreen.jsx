import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useUser } from '../../context/userContext';
import apiClient from '../../services/api';
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
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import { API_ROUTES } from '../../constants/apiRoutes';
import { loginSuccess, loginFail } from '../../redux/slices/authSlice';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useUser();
  const dispatch = useDispatch();

  const TENANT_ID = 'demo';

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Credentials', 'Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    console.log('Attempting login with:', { email, password });

    try {
      console.log('Sending login request to:', API_ROUTES.AUTH.LOGIN);
      const response = await apiClient.post(API_ROUTES.AUTH.LOGIN, {
        emailOrPhone: email,
        password,
             });
console.log('Login Response:', response.data);
if (response.data.status === 'success') {
  const token = response.data.token;
  const user = response.data.data.user;

  // Save to AsyncStorage — key must match api.js interceptor ('token')
  await AsyncStorage.setItem('token', token);        // FIX: was 'userToken'
  await AsyncStorage.setItem('tenantId', TENANT_ID);

  // Update context
  await login(token, user, null, TENANT_ID);

  // Dispatch to Redux
  dispatch(loginSuccess({ token, user, tenantId: TENANT_ID }));

  Alert.alert('Login Successful', 'Welcome to your wallet!');
  navigation.replace('MainNavigator');
}
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || 'Login failed due to a server error.';
      dispatch(loginFail(errorMessage));
      console.log('Login Failed', errorMessage);
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>Welcome Back!</Text>
            <Text style={styles.headerSubtitle}>Sign in to continue to your wallet.</Text>
          </View>

          {/* Form Section */}
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
            />

            <TouchableOpacity style={styles.forgotPasswordContainer}>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <CustomButton
              label="Secure Login"
              onPress={handleLogin}
              isLoading={isLoading}
              variant="primary"
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
    paddingBottom: SIZES.padding * 2,
    paddingTop: SIZES.padding * 2,
    marginTop: -SIZES.padding,
    ...SHADOWS.medium,
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
    color: COLORS.primary,
    fontSize: SIZES.body1,
  },
});

export default LoginScreen;
