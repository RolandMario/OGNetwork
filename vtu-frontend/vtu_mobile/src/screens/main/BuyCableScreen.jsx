import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import TransactionPinModal from '../../components/TransactionPinModal';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import { updateBalance } from '../../redux/slices/walletSlice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROVIDER_COLORS = {
  dstv:      '#00A3E0',
  gotv:      '#88C540',
  startimes: '#FF6600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BuyCableScreen = ({ navigation }) => {
  const dispatch      = useDispatch();
  const walletBalance = useSelector((state) => state.wallet.balance);

  const [allPlans,          setAllPlans]          = useState([]);
  const [providers,         setProviders]         = useState([]);
  const [selectedProvider,  setSelectedProvider]  = useState(null);
  const [selectedPlan,      setSelectedPlan]      = useState(null);
  const [iucNumber,         setIucNumber]         = useState('');
  const [customerName,      setCustomerName]      = useState(null);

  const [loadingPlans,      setLoadingPlans]      = useState(true);
  const [isVerifying,       setIsVerifying]       = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isProcessing,      setIsProcessing]      = useState(false);
  const [pinError,          setPinError]          = useState('');

  // ---------------------------------------------------------------------------
  // Fetch ALL cable plans from DB on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchPlans = async () => {
      setLoadingPlans(true);
      try {
        // Single call — returns all providers + plans with ourPrice
        const response = await apiClient.get(
          `${API_ROUTES.VTU.PLANS}?service=cable`
        );

        const plans = response.data?.data?.plans || [];
        setAllPlans(plans);

        // Derive unique providers from plans
        const seen = new Set();
        const provs = [];
        plans.forEach((p) => {
          if (!seen.has(p.provider)) {
            seen.add(p.provider);
            provs.push({
              identifier: p.provider,
              name:       p.provider.toUpperCase(),
              color:      PROVIDER_COLORS[p.provider] || '#888',
            });
          }
        });

        setProviders(provs);
        if (provs.length) setSelectedProvider(provs[0]);

      } catch (err) {
        console.error('[BuyCable] Failed to load plans:', err.message);
        Alert.alert('Error', 'Failed to load cable packages. Please try again.');
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  // ---------------------------------------------------------------------------
  // Plans for selected provider
  // ---------------------------------------------------------------------------
  const providerPlans = useMemo(() => {
    if (!selectedProvider) return [];
    return allPlans.filter((p) => p.provider === selectedProvider.identifier);
  }, [allPlans, selectedProvider]);

  // ---------------------------------------------------------------------------
  // Provider switch — reset state
  // ---------------------------------------------------------------------------
  const handleProviderSelect = useCallback((provider) => {
    setSelectedProvider(provider);
    setSelectedPlan(null);
    setIucNumber('');
    setCustomerName(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Verify IUC
  // ---------------------------------------------------------------------------
  const handleVerify = async () => {
    if (!iucNumber || iucNumber.length < 5) {
      Alert.alert('Invalid IUC', 'Please enter a valid IUC / smartcard number.');
      return;
    }

    setIsVerifying(true);
    setCustomerName(null);

    try {
      const response = await apiClient.post(API_ROUTES.VTU.CABLE_VERIFY, {
        iuc:        iucNumber,
        identifier: selectedProvider.identifier,
      });

      if (response.data?.status === 'success') {
        const name = response.data?.data?.customer_name || 'Verified';
        setCustomerName(name);
      }
    } catch (err) {
      console.error('[BuyCable] IUC verify error:', err.message);
      Alert.alert('Verification Failed', err.response?.data?.message || 'Could not verify IUC. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Initiate purchase
  // ---------------------------------------------------------------------------
  const initiatePurchase = () => {
    if (!iucNumber || iucNumber.length < 5) {
      Alert.alert('IUC Required', 'Please enter your smartcard / IUC number.');
      return;
    }
    if (!customerName) {
      Alert.alert('Verification Required', 'Please verify your IUC number first.');
      return;
    }
    if (!selectedPlan) {
      Alert.alert('No Package Selected', 'Please select a subscription package.');
      return;
    }
    if (selectedPlan.ourPrice > walletBalance) {
      Alert.alert(
        'Insufficient Balance',
        `You need ₦${Number(selectedPlan.ourPrice).toLocaleString()} but your balance is ₦${walletBalance.toLocaleString()}.`
      );
      return;
    }
    setPinError('');
    setIsPinModalVisible(true);
  };

  // ---------------------------------------------------------------------------
  // PIN submitted
  // ---------------------------------------------------------------------------
  const onPinSubmit = async (pin) => {
    setIsProcessing(true);
    setPinError('');

    try {
      // FIX: no amount in body — backend looks up ourPrice from DB
      // FIX: plan field uses planCode from DB
      const response = await apiClient.post(API_ROUTES.VTU.CABLE_SUBSCRIBE, {
        identifier: selectedProvider.identifier,
        plan:       selectedPlan.planCode,
        iuc:        iucNumber,
        phone:      iucNumber,
        pin,
      });

      if (response.data?.status === 'success') {
        setIsPinModalVisible(false);

        if (response.data.data?.newBalance !== undefined) {
          dispatch(updateBalance(response.data.data.newBalance));
        }

        Alert.alert(
          '✅ Subscription Successful',
          `${selectedProvider.name} ${selectedPlan.planName} activated for IUC ${iucNumber}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }

    } catch (error) {
      console.error('[BuyCable] Purchase error:', error.response?.data || error.message);
      const status = error.response?.status;
      const msg    = error.response?.data?.message || 'Transaction failed. Please try again.';

      if (status === 403) {
        setIsPinModalVisible(false);
        Alert.alert('PIN Required', 'Please set a transaction PIN first.', [
          { text: 'Set PIN', onPress: () => navigation.navigate('SetPin') },
        ]);
      } else if (status === 401 && msg.toLowerCase().includes('pin')) {
        setPinError('Incorrect PIN. Please try again.');
      } else {
        setIsPinModalVisible(false);
        Alert.alert('Purchase Failed', msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cable TV</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Providers */}
        <Text style={styles.sectionTitle}>Select Provider</Text>
        {loadingPlans ? (
          <ActivityIndicator color="#FFF" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.providerGrid}>
            {providers.map((provider) => {
              const isSelected = selectedProvider?.identifier === provider.identifier;
              return (
                <TouchableOpacity
                  key={provider.identifier}
                  style={[styles.providerCard, isSelected && { borderColor: provider.color, borderWidth: 2 }]}
                  onPress={() => handleProviderSelect(provider)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconPlaceholder, { backgroundColor: provider.color }]}>
                    <Text style={styles.iconText}>{provider.name[0]}</Text>
                  </View>
                  <Text style={[styles.providerName, isSelected && styles.providerNameSelected]}>
                    {provider.name}
                  </Text>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: provider.color }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* IUC Input */}
        <View style={styles.inputSection}>
          <Text style={styles.label}>Smartcard / IUC Number</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter IUC number"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={iucNumber}
              onChangeText={(val) => {
                setIucNumber(val);
                setCustomerName(null);
              }}
            />
            <TouchableOpacity
              style={[styles.verifyBtn, { backgroundColor: selectedProvider?.color || COLORS.primary }]}
              onPress={handleVerify}
              disabled={isVerifying}
            >
              {isVerifying
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.verifyBtnText}>Verify</Text>
              }
            </TouchableOpacity>
          </View>

          {customerName && (
            <View style={styles.verifiedBanner}>
              <Ionicons name="person-circle" size={20} color="#2ECC71" />
              <Text style={styles.verifiedText}>{customerName}</Text>
            </View>
          )}
        </View>

        {/* Balance hint */}
        <Text style={styles.balanceHint}>
          Balance: ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </Text>

        {/* Plans */}
        <Text style={styles.sectionTitle}>Available Packages</Text>
        {loadingPlans ? (
          <ActivityIndicator color="#FFF" size="large" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.planList}>
            {providerPlans.length > 0 ? providerPlans.map((plan) => {
              const isActive = selectedPlan?.planCode === plan.planCode;
              return (
                <TouchableOpacity
                  key={plan.planCode}
                  style={[styles.planCard, isActive && styles.planCardActive]}
                  onPress={() => setSelectedPlan(plan)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, isActive && styles.planTextActive]}>
                      {plan.planName}
                    </Text>
                    {plan.description ? (
                      <Text style={[styles.planDescription, isActive && styles.planTextActive]} numberOfLines={1}>
                        {plan.description}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.planPrice, isActive && styles.planTextActive]}>
                    ₦{Number(plan.ourPrice).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            }) : (
              <Text style={styles.emptyText}>No packages available.</Text>
            )}
          </View>
        )}

      </ScrollView>

      {/* Footer */}
      {selectedPlan && (
        <View style={styles.footer}>
          <View>
            <Text style={styles.totalLabel}>Total to Pay</Text>
            <Text style={styles.totalAmount}>₦{Number(selectedPlan.ourPrice).toLocaleString()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.payButton, { backgroundColor: selectedProvider?.color || COLORS.primary }]}
            onPress={initiatePurchase}
            disabled={isProcessing}
          >
            {isProcessing
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Text style={styles.payButtonText}>Pay Now</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* PIN Modal */}
      <TransactionPinModal
        isVisible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onSubmit={onPinSubmit}
        isLoading={isProcessing}
        error={pinError}
        transactionType="Cable TV"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: COLORS.primary },
  header:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SIZES.padding, paddingVertical: 15 },
  headerTitle:         { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textWhite },
  scrollContent:       { padding: 20, paddingBottom: 120 },
  sectionTitle:        { ...FONTS.bold, fontSize: 16, color: COLORS.textWhite, marginBottom: 12, marginTop: 10 },
  providerGrid:        { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  providerCard:        { width: '24%', backgroundColor: '#fff', borderRadius: 12, padding: 5, marginBottom: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', elevation: 3 },
  iconPlaceholder:     { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  iconText:            { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  providerName:        { fontSize: 10, fontWeight: '600', color: '#555' },
  providerNameSelected:{ color: '#000', fontWeight: '700' },
  checkBadge:          { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  inputSection:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, elevation: 2 },
  label:               { fontSize: 12, color: '#666', marginBottom: 8, textTransform: 'uppercase', fontWeight: '600' },
  inputContainer:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input:               { flex: 1, height: 50, backgroundColor: '#F0F2F5', borderRadius: 8, paddingHorizontal: 15, fontSize: 16, color: '#333' },
  verifyBtn:           { height: 50, paddingHorizontal: 20, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  verifyBtnText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  verifiedBanner:      { marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F8F5', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2ECC71' },
  verifiedText:        { marginLeft: 8, color: '#27AE60', fontWeight: '600', fontSize: 14 },
  balanceHint:         { ...FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'right', marginBottom: 10 },
  planList:            { gap: 10, paddingBottom: 20 },
  planCard:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  planCardActive:      { backgroundColor: '#222', borderColor: '#222' },
  planName:            { ...FONTS.semiBold, fontSize: 15, color: '#333', marginBottom: 2 },
  planDescription:     { fontSize: 11, color: '#888' },
  planPrice:           { ...FONTS.bold, fontSize: 16, color: '#2ECC71' },
  planTextActive:      { color: '#fff' },
  emptyText:           { textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: 20 },
  footer:              { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 20 },
  totalLabel:          { fontSize: 12, color: '#888' },
  totalAmount:         { ...FONTS.bold, fontSize: 22, color: '#333' },
  payButton:           { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 30, alignItems: 'center', gap: 8 },
  payButtonText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default BuyCableScreen;