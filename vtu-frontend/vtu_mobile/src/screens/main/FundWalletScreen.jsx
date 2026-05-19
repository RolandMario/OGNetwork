import React, { useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking, // Important for opening the payment URL
  StatusBar
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';

const FundWalletScreen = ({ navigation }) => {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- CONFIGURATION ---
  const API_URL = Platform.OS === 'android' ? 'https://vtu-project.vercel.app' : 'https://vtu-project.vercel.app';
  const TENANT_ID = 'clientA';

  // Quick select options
  const PRESET_AMOUNTS = ['1000', '2000', '5000', '10000', '20000', '50000'];

  const handleInitiateFunding = async () => {
    // 1. Validation
    if (!amount || isNaN(amount) || Number(amount) < 100) {
      Alert.alert('Invalid Amount', 'Minimum funding amount is ₦100.');
      return;
    }

    setIsLoading(true);

    try {
      const token = await AsyncStorage.getItem('userToken');

      // 2. Call Backend
      const response = await axios.post(
        `${API_URL}/api/v1/user/wallet/fund`,
        { amount: Number(amount) },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // 3. Handle Success
      if (response.data.status === 'success') {
        const { paymentUrl, transactionReference } = response.data.data;

        // Open the payment gateway in the browser
        const supported = await Linking.canOpenURL(paymentUrl);
        if (supported) {
          await Linking.openURL(paymentUrl);
          
          // Optional: Navigate to a "Waiting" screen or back to Home
          Alert.alert(
            'Payment Initiated', 
            'Complete the payment in your browser. Your wallet will be credited automatically upon success.',
            [{ text: 'Okay', onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert('Error', "Cannot open payment link: " + paymentUrl);
        }
      }

    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || 'Could not initiate payment.';
      Alert.alert('Funding Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundMain} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fund Wallet</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          
          {/* Main Input Card */}
          <View style={styles.card}>
            <Text style={styles.label}>How much do you want to add?</Text>
            
            <View style={styles.inputWrapper}>
              <Text style={styles.currencySymbol}>₦</Text>
              <CustomInput
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                style={styles.customInputStyle} // You might need to adjust CustomInput to accept style prop
                containerStyle={{ flex: 1, marginBottom: 0 }}
              />
            </View>
            <Text style={styles.helperText}>Minimum amount: ₦100</Text>

            {/* Quick Select Pills */}
            <View style={styles.pillsContainer}>
              {PRESET_AMOUNTS.map((amt) => (
                <TouchableOpacity 
                  key={amt} 
                  style={[
                    styles.pill, 
                    amount === amt && styles.activePill
                  ]}
                  onPress={() => setAmount(amt)}
                >
                  <Text style={[
                    styles.pillText,
                    amount === amt && styles.activePillText
                  ]}>
                    ₦{amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Payment Method Info */}
          <View style={styles.infoContainer}>
            <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.success} />
            <Text style={styles.infoText}>
              Payments are secured by Paystack/Flutterwave. You will be redirected to complete the transaction.
            </Text>
          </View>

        </View>

        {/* Bottom Button */}
        <View style={styles.footer}>
          <CustomButton
            label={isLoading ? "Processing..." : `Pay ₦${amount || '0.00'}`}
            onPress={handleInitiateFunding}
            isLoading={isLoading}
            variant="primary"
            disabled={!amount}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 15,
  },
  customInputStyle:{
    width:'100%',
    color:'#000000'
  },
  headerTitle: {
    ...FONTS.bold,
    fontSize: SIZES.h3,
    color: COLORS.textWhite,
  },
  backBtn: {
    padding: 5,
    color:'#ffffff'
  },
  content: {
    padding: SIZES.padding,
    flex: 1,
  },
  card: {
    backgroundColor: COLORS.surfaceWhite,
    padding: 24,
    borderRadius: SIZES.radius,
    ...SHADOWS.light,
  },
  label: {
    ...FONTS.medium,
    color: COLORS.textSecondary,
    fontSize: SIZES.body1,
    marginBottom: 15,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  currencySymbol: {
    ...FONTS.bold,
    fontSize: 24,
    color: COLORS.textPrimary,
    marginRight: 10,
    marginTop: -20 // Adjust alignment with input
  },
  helperText: {
    ...FONTS.regular,
    fontSize: SIZES.body2,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 10,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceWhite,
  },
  activePill: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pillText: {
    ...FONTS.medium,
    color: COLORS.textPrimary,
  },
  activePillText: {
    color: COLORS.textWhite,
  },
  infoContainer: {
    flexDirection: 'row',
    marginTop: 24,
    padding: 15,
    backgroundColor: '#E6FFFA', // Light green bg
    borderRadius: SIZES.radius,
    alignItems: 'flex-start',
  },
  infoText: {
    ...FONTS.regular,
    color: COLORS.textPrimary,
    fontSize: SIZES.body2,
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    padding: SIZES.padding,
    backgroundColor: COLORS.surfaceWhite,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  }
});

export default FundWalletScreen;