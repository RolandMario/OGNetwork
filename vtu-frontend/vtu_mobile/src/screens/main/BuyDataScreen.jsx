import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, FlatList, Alert, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import TransactionPinModal from '../../components/TransactionPinModal';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import { updateBalance } from '../../redux/slices/walletSlice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const NETWORK_COLORS = {
  mtn_gifting_data: '#FFCC00',
  glo_data:         '#2ecc71',
  airtel_data:      '#e74c3c',
  '9mobile_data':   '#006633',
  '9mobile_gifting':'#006633',
  mtn_data_share:   '#FFAA00',
};

const NETWORK_LABELS = {
  mtn_gifting_data: 'MTN',
  glo_data:         'GLO',
  airtel_data:      'Airtel',
  '9mobile_data':   '9mobile',
  '9mobile_gifting':'9mobile+',
  mtn_data_share:   'MTN Share',
};

// Derive filter category from plan name
function getPlanCategory(name = '') {
  const l = name.toLowerCase();
  if (l.includes('1day') || l.includes('1 day') || l.includes('2days') || l.includes('2 day')) return 'Daily';
  if (l.includes('7day') || l.includes('7 day') || l.includes('weekly') || l.includes('week')) return 'Weekly';
  if (l.includes('month') || l.includes('1month') || l.includes('30')) return 'Monthly';
  if (l.includes('year') || l.includes('2 month')) return 'Long';
  return 'Other';
}

const FILTERS = ['All', 'Daily', 'Weekly', 'Monthly', 'Long', 'Other'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BuyDataScreen = ({ navigation }) => {
  const dispatch      = useDispatch();
  const walletBalance = useSelector((state) => state.wallet.balance);
  const authUser      = useSelector((state) => state.auth.user);

  // Networks are derived from plans — group by provider
  const [networks,          setNetworks]          = useState([]);
  const [selectedNetwork,   setSelectedNetwork]   = useState(null);
  const [allPlans,          setAllPlans]          = useState([]);  // all plans from DB
  const [selectedPlan,      setSelectedPlan]      = useState(null);
  const [phone,             setPhone]             = useState('');
  const [selectedFilter,    setSelectedFilter]    = useState('All');

  const [loadingPlans,      setLoadingPlans]      = useState(true);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isProcessing,      setIsProcessing]      = useState(false);
  const [pinError,          setPinError]          = useState('');

  // Auto-fill phone number from logged-in user's profile
  useEffect(() => {
    if (authUser?.phone) {
      setPhone(authUser.phone);
    }
  }, [authUser]);

  // ---------------------------------------------------------------------------
  // Fetch ALL data plans from DB on mount (single call — grouped by provider)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchPlans = async () => {
      setLoadingPlans(true);
      try {
        // FIX: single endpoint returns all providers + plans with ourPrice
        const response = await apiClient.get(
          `${API_ROUTES.VTU.PLANS}?service=data`
        );

        const plans = response.data?.data?.plans || [];
        setAllPlans(plans);

        // Derive unique networks from plans
        const seen = new Set();
        const nets = [];
        plans.forEach((p) => {
          if (!seen.has(p.provider)) {
            seen.add(p.provider);
            nets.push({ identifier: p.provider });
          }
        });

        setNetworks(nets);
        if (nets.length) setSelectedNetwork(nets[0].identifier);

      } catch (err) {
        console.error('[BuyData] Failed to load plans:', err.message);
        Alert.alert('Error', 'Failed to load data plans. Please try again.');
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  // ---------------------------------------------------------------------------
  // Plans for selected network
  // ---------------------------------------------------------------------------
  const networkPlans = useMemo(() => {
    if (!selectedNetwork) return [];
    return allPlans.filter((p) => p.provider === selectedNetwork);
  }, [allPlans, selectedNetwork]);

  // ---------------------------------------------------------------------------
  // Filter by category
  // ---------------------------------------------------------------------------
  const filteredPlans = useMemo(() => {
    if (selectedFilter === 'All') return networkPlans;
    return networkPlans.filter((p) => getPlanCategory(p.planName) === selectedFilter);
  }, [networkPlans, selectedFilter]);

  // ---------------------------------------------------------------------------
  // Network switch — reset plan selection
  // ---------------------------------------------------------------------------
  const handleNetworkChange = useCallback((identifier) => {
    setSelectedNetwork(identifier);
    setSelectedPlan(null);
    setSelectedFilter('All');
  }, []);

  // ---------------------------------------------------------------------------
  // Initiate purchase
  // ---------------------------------------------------------------------------
  const initiatePurchase = () => {
    if (!phone || phone.length !== 11) {
      Alert.alert('Invalid Phone', 'Please enter a valid 11-digit phone number.');
      return;
    }
    if (!selectedPlan) {
      Alert.alert('No Plan Selected', 'Please select a data plan.');
      return;
    }
    // Balance check: ourPrice (Naira) vs walletBalance (Naira)
    if (selectedPlan.ourPrice > walletBalance) {
      Alert.alert('Insufficient Balance', `Your wallet balance is ₦${walletBalance.toLocaleString()}.`);
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
      const response = await apiClient.post(API_ROUTES.VTU.BUY_DATA, {
        network:       selectedNetwork,
        plan_code:     selectedPlan.planCode,   // FIX: DB field is planCode not plan_code
        mobile_number: phone,
        pin,
      });

      if (response.data?.status === 'success') {
        setIsPinModalVisible(false);

        if (response.data.data?.newBalance !== undefined) {
          dispatch(updateBalance(response.data.data.newBalance)); // balance is in Naira
        }

        Alert.alert(
          '✅ Data Purchase Successful',
          `${selectedPlan.planName} sent to ${phone}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }

    } catch (error) {
      console.error('[BuyData] Purchase error:', error.response?.data || error.message);
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
  // Plan card
  // ---------------------------------------------------------------------------
  const renderPlanCard = useCallback(({ item }) => {
    const isSelected = selectedPlan?.planCode === item.planCode;
    return (
      <TouchableOpacity
        style={[styles.planCard, isSelected && styles.selectedCard]}
        onPress={() => setSelectedPlan(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.planLabel, isSelected && styles.selectedText]} numberOfLines={2}>
          {item.planName}
        </Text>
        <Text style={[styles.planPrice, isSelected && styles.selectedPriceText]}>
          ₦{Number(item.ourPrice).toLocaleString()}
        </Text>
        {isSelected && (
          <View style={styles.checkIcon}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedPlan]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundMain} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : null} style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buy Data Bundle</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>

          {/* Network Selection */}
          <Text style={styles.sectionLabel}>Select Network</Text>
          {loadingPlans ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.networkContainer}>
              {networks.map((net) => {
                const isSelected = selectedNetwork === net.identifier;
                const color      = NETWORK_COLORS[net.identifier] || '#888';
                const label      = NETWORK_LABELS[net.identifier] || net.identifier;
                return (
                  <TouchableOpacity
                    key={net.identifier}
                    style={[styles.networkItem, isSelected && { borderColor: color, borderWidth: 2 }]}
                    onPress={() => handleNetworkChange(net.identifier)}
                  >
                    <View style={[styles.networkCircle, { backgroundColor: color }]}>
                      <Text style={styles.networkInitial}>{label[0]}</Text>
                    </View>
                    <Text style={styles.networkName}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Phone Input */}
          <Text style={styles.sectionLabel}>Phone Number</Text>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="cellphone" size={24} color={COLORS.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="08012345678"
              keyboardType="phone-pad"
              maxLength={11}
              value={phone}
              onChangeText={setPhone}
            />
            <TouchableOpacity
              onPress={() => {
                if (authUser?.phone) {
                  setPhone(authUser.phone);
                } else {
                  Alert.alert('Phone Not Found', 'Please set your phone number in profile settings.');
                }
              }}
              style={styles.myNumberBtn}
            >
              <Text style={styles.myNumberBtnText}>My Number</Text>
            </TouchableOpacity>
          </View>

          {/* Balance hint */}
          <Text style={styles.balanceHint}>
            Balance: ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </Text>

          {/* Filters */}
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterTab, selectedFilter === filter && styles.activeFilterTab]}
                  onPress={() => setSelectedFilter(filter)}
                >
                  <Text style={[styles.filterText, selectedFilter === filter && styles.activeFilterText]}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Plans Grid */}
          {loadingPlans ? (
            <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={filteredPlans}
              keyExtractor={(item) => item.planCode}
              renderItem={renderPlanCard}
              numColumns={3}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.columnWrapper}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No plans available for this category.</Text>
              }
            />
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.buyButton,
              (!selectedPlan || phone.length !== 11) && styles.disabledButton,
            ]}
            onPress={initiatePurchase}
            disabled={!selectedPlan || phone.length !== 11 || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buyButtonText}>
                {selectedPlan ? `Pay ₦${Number(selectedPlan.ourPrice).toLocaleString()}` : 'Select a Plan'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* PIN Modal */}
      <TransactionPinModal
        isVisible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onSubmit={onPinSubmit}
        isLoading={isProcessing}
        error={pinError}
        transactionType="Data Bundle"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: COLORS.backgroundMain },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFF' },
  headerTitle:       { ...FONTS.bold, fontSize: 18 },
  content:           { flex: 1, paddingHorizontal: 20 },
  sectionLabel:      { ...FONTS.bold, fontSize: 14, color: COLORS.textSecondary, marginTop: 15, marginBottom: 10 },
  networkContainer:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  networkItem:       { alignItems: 'center', padding: 5, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  networkCircle:     { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  networkInitial:    { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  networkName:       { fontSize: 11, color: COLORS.textPrimary },
  inputContainer:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: SIZES.radius, paddingHorizontal: 15, height: 55, ...SHADOWS.light },
  input:             { flex: 1, marginLeft: 10, fontSize: 16 },
  myNumberBtn:       { backgroundColor: '#E6FFFA', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, marginLeft: 8 },
  myNumberBtnText:   { ...FONTS.medium, fontSize: 12, color: COLORS.accent },
  balanceHint:       { ...FONTS.regular, fontSize: 12, color: COLORS.textSecondary, textAlign: 'right', marginTop: 6 },
  filterContainer:   { marginTop: 15, marginBottom: 10, height: 40 },
  filterTab:         { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E2E8F0', marginRight: 10, justifyContent: 'center' },
  activeFilterTab:   { backgroundColor: COLORS.primary },
  filterText:        { fontSize: 12, color: COLORS.textPrimary },
  activeFilterText:  { color: '#FFF', fontWeight: 'bold' },
  gridContent:       { paddingBottom: 120, paddingTop: 10 },
  columnWrapper:     { justifyContent: 'space-between' },
  planCard:          { width: '31%', backgroundColor: '#FFF', borderRadius: 12, padding: 10, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: '#eee', ...SHADOWS.light, position: 'relative' },
  selectedCard:      { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  planLabel:         { ...FONTS.medium, fontSize: 11, color: COLORS.textPrimary, textAlign: 'center', marginBottom: 6 },
  planPrice:         { ...FONTS.bold, fontSize: 13, color: COLORS.primary },
  selectedText:      { color: '#FFF' },
  selectedPriceText: { color: '#FFF', ...FONTS.bold, fontSize: 13 },
  checkIcon:         { position: 'absolute', top: 4, right: 4, backgroundColor: '#FFF', borderRadius: 10 },
  emptyText:         { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 },
  footer:            { backgroundColor: '#FFF', padding: 20, borderTopWidth: 1, borderTopColor: '#EEE' },
  buyButton:         { backgroundColor: COLORS.primary, height: 55, borderRadius: SIZES.radius, justifyContent: 'center', alignItems: 'center' },
  disabledButton:    { backgroundColor: '#CBD5E1' },
  buyButtonText:     { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});

export default BuyDataScreen;