import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import {
  initiateFundingStart,
  initiateFundingSuccess,
  initiateFundingFail,
  verifyFundingSuccess,
  verifyFundingFail,
  fetchBalanceSuccess,
} from '../../redux/slices/walletSlice';

const PRESET_AMOUNTS = ['1000', '2000', '5000', '10000', '20000', '50000'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const FundWalletScreen = ({ navigation }) => {
  const dispatch = useDispatch();

  const [activeTab,   setActiveTab]   = useState('card'); // 'card' | 'transfer'
  const [amount,      setAmount]      = useState('');
  const [isLoading,   setIsLoading]   = useState(false);
  const [verifying,   setVerifying]   = useState(false);

  // Dedicated account state
  const [accountDetails,    setAccountDetails]    = useState(null); // { accountNumber, accountName, bankName } | null
  const [loadingAccount,    setLoadingAccount]    = useState(true);
  const [provisioning,      setProvisioning]      = useState(false);
  const [copied,            setCopied]            = useState(false);

  const fundingState = useSelector((state) => state.wallet.fundingState);

  // ---------------------------------------------------------------------------
  // Fetch dedicated account details on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchAccountDetails();
  }, []);

  const fetchAccountDetails = async () => {
    setLoadingAccount(true);
    try {
      const response = await apiClient.get(API_ROUTES.WALLET.ACCOUNT_DETAILS);

      if (response.data?.status === 'success') {
        const data = response.data.data;
        if (data.provisioned) {
          setAccountDetails({
            accountNumber: data.accountNumber,
            accountName:   data.accountName,
            bankName:      data.bankName,
          });
        } else {
          setAccountDetails(null);
        }
      }
    } catch (err) {
      console.error('[FundWallet] fetchAccountDetails error:', err.response?.data || err.message);
      setAccountDetails(null);
    } finally {
      setLoadingAccount(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Activate / retry dedicated account provisioning
  // ---------------------------------------------------------------------------
  const handleActivateTransferAccount = async () => {
    setProvisioning(true);
    try {
      const response = await apiClient.post(API_ROUTES.WALLET.PROVISION_ACCOUNT);

      if (response.data?.status === 'success' && response.data.data?.dedicatedAccount) {
        const dva = response.data.data.dedicatedAccount;
        setAccountDetails({
          accountNumber: dva.accountNumber,
          accountName:   dva.accountName,
          bankName:      dva.bankName,
        });
        Alert.alert('Account Ready', 'Your dedicated transfer account has been activated.');
      }
    } catch (err) {
      const msg = err.response?.data?.message
        || 'Bank transfer funding is not available yet. Please use Card/Bank checkout for now.';
      Alert.alert('Not Available', msg);
    } finally {
      setProvisioning(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Copy account number to clipboard
  // ---------------------------------------------------------------------------
  const handleCopyAccountNumber = async () => {
    if (!accountDetails?.accountNumber) return;
    await Clipboard.setStringAsync(accountDetails.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // Card/Bank checkout flow (unchanged)
  // ---------------------------------------------------------------------------
  const handleInitiateFunding = async () => {
    if (!amount || isNaN(amount) || Number(amount) < 100) {
      Alert.alert('Invalid Amount', 'Minimum funding amount is ₦100.');
      return;
    }

    dispatch(initiateFundingStart());
    setIsLoading(true);

    try {
      const response = await apiClient.post(API_ROUTES.WALLET.FUND, { amount: Number(amount) });

      if (response.data.status === 'success') {
        const { paymentUrl, transactionReference } = response.data.data;

        await AsyncStorage.setItem('pendingTransactionRef', transactionReference);

        dispatch(
          initiateFundingSuccess({
            transactionRef: transactionReference,
            amount: Number(amount),
            paymentUrl,
          })
        );

        const supported = await Linking.canOpenURL(paymentUrl);
        if (supported) {
          await Linking.openURL(paymentUrl);
          Alert.alert(
            'Payment Initiated',
            'You will be redirected to complete payment. Your wallet will be credited upon successful payment.',
            [
              {
                text: 'OK',
                onPress: () => {
                  setTimeout(() => verifyFunding(transactionReference), 3000);
                },
              },
            ]
          );
        } else {
          Alert.alert('Error', 'Cannot open payment link');
        }
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Could not initiate payment.';
      dispatch(initiateFundingFail(msg));
      Alert.alert('Funding Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyFunding = async (transactionRef) => {
    setVerifying(true);
    try {
      const response = await apiClient.post(API_ROUTES.WALLET.VERIFY, {
        reference: transactionRef,
      });

      if (response.data.status === 'success') {
        const newBalance = response.data.data.newBalance;

        dispatch(verifyFundingSuccess({ newBalance }));
        dispatch(fetchBalanceSuccess({ balance: newBalance, currency: 'NGN' }));

        await AsyncStorage.removeItem('pendingTransactionRef');

        Alert.alert(
          'Success!',
          `₦${amount} has been successfully added to your wallet.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setAmount('');
                navigation.goBack();
              },
            },
          ]
        );
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Verification failed. Please try again.';
      dispatch(verifyFundingFail(msg));
      Alert.alert('Verification Failed', msg);
    } finally {
      setVerifying(false);
    }
  };

  // Check for pending transaction on load
  useEffect(() => {
    const checkPendingTransaction = async () => {
      const pendingRef = await AsyncStorage.getItem('pendingTransactionRef');
      if (pendingRef) {
        Alert.alert(
          'Pending Transaction',
          'We found a pending payment. Would you like to verify it?',
          [
            { text: 'Verify', onPress: () => verifyFunding(pendingRef) },
            {
              text: 'Cancel',
              onPress: async () => {
                await AsyncStorage.removeItem('pendingTransactionRef');
              },
            },
          ]
        );
      }
    };
    checkPendingTransaction();
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'card' && styles.activeTabBtn]}
          onPress={() => setActiveTab('card')}
        >
          <Ionicons
            name="card-outline"
            size={18}
            color={activeTab === 'card' ? COLORS.primary : 'rgba(255,255,255,0.7)'}
          />
          <Text style={[styles.tabText, activeTab === 'card' && styles.activeTabText]}>
            Card / Bank
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'transfer' && styles.activeTabBtn]}
          onPress={() => setActiveTab('transfer')}
        >
          <Ionicons
            name="swap-horizontal-outline"
            size={18}
            color={activeTab === 'transfer' ? COLORS.primary : 'rgba(255,255,255,0.7)'}
          />
          <Text style={[styles.tabText, activeTab === 'transfer' && styles.activeTabText]}>
            Bank Transfer
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        {/* ============================== CARD / BANK TAB ============================== */}
        {activeTab === 'card' && (
          <>
            <View style={styles.content}>
              <View style={styles.card}>
                <Text style={styles.label}>How much do you want to add?</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.currencySymbol}>₦</Text>
                  <CustomInput
                    placeholder="0.00"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    style={styles.customInputStyle}
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                  />
                </View>
                <Text style={styles.helperText}>Minimum amount: ₦100</Text>

                <View style={styles.pillsContainer}>
                  {PRESET_AMOUNTS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.pill, amount === amt && styles.activePill]}
                      onPress={() => setAmount(amt)}
                    >
                      <Text style={[styles.pillText, amount === amt && styles.activePillText]}>
                        ₦{amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.infoContainer}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.success} />
                <Text style={styles.infoText}>
                  Payments are secured by Paystack. You will be redirected to complete the transaction.
                </Text>
              </View>

              {fundingState.status === 'pending' && fundingState.transactionRef && (
                <View style={styles.pendingContainer}>
                  <Text style={styles.pendingText}>
                    Verifying transaction: {fundingState.transactionRef.substring(0, 8)}...
                  </Text>
                  <TouchableOpacity onPress={() => verifyFunding(fundingState.transactionRef)} disabled={verifying}>
                    <Text style={styles.verifyLink}>
                      {verifying ? 'Verifying...' : 'Verify Payment'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              {verifying ? (
                <View style={styles.loadingButton}>
                  <ActivityIndicator color={COLORS.textWhite} />
                  <Text style={styles.loadingText}>Verifying Payment...</Text>
                </View>
              ) : (
                <CustomButton
                  label={isLoading ? 'Processing...' : `Pay ₦${amount || '0.00'}`}
                  onPress={handleInitiateFunding}
                  isLoading={isLoading}
                  variant="primary"
                  disabled={!amount || isLoading}
                />
              )}
            </View>
          </>
        )}

        {/* ============================== BANK TRANSFER TAB ============================== */}
        {activeTab === 'transfer' && (
          <View style={styles.content}>

            {loadingAccount ? (
              <View style={styles.card}>
                <ActivityIndicator color={COLORS.primary} size="large" style={{ marginVertical: 20 }} />
                <Text style={[styles.helperText, { textAlign: 'center' }]}>Loading your account details...</Text>
              </View>

            ) : accountDetails ? (
              <View style={styles.card}>
                <Text style={styles.label}>Transfer to this account anytime</Text>

                <View style={styles.accountBox}>
                  <Text style={styles.bankName}>{accountDetails.bankName}</Text>

                  <View style={styles.accountNumberRow}>
                    <Text style={styles.accountNumber}>{accountDetails.accountNumber}</Text>
                    <TouchableOpacity onPress={handleCopyAccountNumber} style={styles.copyBtn}>
                      <Ionicons
                        name={copied ? 'checkmark-circle' : 'copy-outline'}
                        size={20}
                        color={copied ? '#27AE60' : COLORS.primary}
                      />
                      <Text style={[styles.copyText, copied && { color: '#27AE60' }]}>
                        {copied ? 'Copied' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.accountName}>{accountDetails.accountName}</Text>
                </View>

                <View style={styles.infoContainer}>
                  <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.infoText}>
                    Any amount transferred to this account is automatically credited to your wallet —
                    usually within a few seconds. This account is permanently yours.
                  </Text>
                </View>
              </View>

            ) : (
              <View style={styles.card}>
                <Ionicons
                  name="alert-circle-outline"
                  size={40}
                  color={COLORS.textSecondary}
                  style={{ alignSelf: 'center', marginBottom: 10 }}
                />
                <Text style={[styles.label, { textAlign: 'center' }]}>
                  Bank transfer account not yet active
                </Text>
                <Text style={[styles.helperText, { textAlign: 'center', marginBottom: 20 }]}>
                  Tap below to activate your dedicated transfer account. If this is unavailable,
                  please use Card/Bank checkout instead.
                </Text>

                <CustomButton
                  label={provisioning ? 'Activating...' : 'Activate Bank Transfer'}
                  onPress={handleActivateTransferAccount}
                  isLoading={provisioning}
                  variant="primary"
                />
              </View>
            )}

          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 15,
  },
  headerTitle: { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textWhite },
  backBtn: { padding: 5 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SIZES.padding,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeTabBtn: { backgroundColor: '#FFF' },
  tabText: { ...FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  activeTabText: { color: COLORS.primary, ...FONTS.bold },

  content: { padding: SIZES.padding, flex: 1 },
  card: { backgroundColor: COLORS.surfaceWhite, padding: 24, borderRadius: SIZES.radius, ...SHADOWS.light },
  label: { ...FONTS.medium, color: COLORS.textSecondary, fontSize: SIZES.body1, marginBottom: 15 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  currencySymbol: { ...FONTS.bold, fontSize: 24, color: COLORS.textPrimary, marginRight: 10, marginTop: -20 },
  customInputStyle: { width: '100%', color: '#000000' },
  helperText: { ...FONTS.regular, fontSize: SIZES.body2, color: COLORS.textSecondary, marginBottom: 20 },
  pillsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 10 },
  pill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceWhite },
  activePill: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { ...FONTS.medium, color: COLORS.textPrimary },
  activePillText: { color: COLORS.textWhite },

  infoContainer: { flexDirection: 'row', marginTop: 24, padding: 15, backgroundColor: '#E6FFFA', borderRadius: SIZES.radius, alignItems: 'flex-start' },
  infoText: { ...FONTS.regular, color: COLORS.textPrimary, fontSize: SIZES.body2, marginLeft: 10, flex: 1, lineHeight: 20 },

  pendingContainer: { marginTop: 20, padding: 15, backgroundColor: '#FFF3E0', borderRadius: SIZES.radius, borderLeftWidth: 4, borderLeftColor: '#FF9800' },
  pendingText: { ...FONTS.regular, color: COLORS.textPrimary, fontSize: SIZES.body2, marginBottom: 10 },
  verifyLink: { ...FONTS.bold, color: '#FF9800', fontSize: SIZES.body2 },

  footer: { padding: SIZES.padding, backgroundColor: COLORS.surfaceWhite, borderTopWidth: 1, borderTopColor: COLORS.border },
  loadingButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: SIZES.radius, gap: 10 },
  loadingText: { ...FONTS.medium, color: COLORS.textWhite, fontSize: SIZES.body1 },

  // Dedicated account styles
  accountBox: {
    backgroundColor: '#F7F9FC',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  bankName: { ...FONTS.bold, fontSize: SIZES.body1, color: COLORS.textPrimary, marginBottom: 8, textTransform: 'uppercase' },
  accountNumberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountNumber: { ...FONTS.bold, fontSize: 26, color: COLORS.primary, letterSpacing: 1.5 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  copyText: { ...FONTS.medium, fontSize: 12, color: COLORS.primary },
  accountName: { ...FONTS.medium, fontSize: SIZES.body2, color: COLORS.textSecondary, marginTop: 10 },
});

export default FundWalletScreen;