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

// The 4 canonical networks. Every provider identifier is normalized back to
// one of these (e.g. mtn_gifting_data -> mtn, glo_data -> glo,
// 9mobile_gifting -> 9mobile).
const NETWORKS = [
  { identifier: 'mtn',     label: 'MTN',     color: '#FFCC00' },
  { identifier: 'airtel',  label: 'Airtel',  color: '#E60000' },
  { identifier: 'glo',     label: 'GLO',     color: '#00C300' },
  { identifier: '9mobile', label: '9mobile', color: '#006633' },
];

// Preferred ordering for the plan-type chips.
const PLAN_TYPE_ORDER = ['Regular', 'Gifting', 'Corporate Gifting', 'Corporate', 'SME', 'Special', 'Data Share', 'Other'];

// Map any provider identifier to its canonical network.
function getNetworkFromProvider(provider = '') {
  const p = String(provider).toLowerCase();
  if (p.includes('mtn')) return 'mtn';
  if (p.includes('airtel')) return 'airtel';
  if (p.includes('glo')) return 'glo';
  if (p.includes('9mobile') || p.includes('etisalat')) return '9mobile';
  return 'other';
}

// Derive the plan type (Gifting, Corporate Gifting, SME, Special, Data Share,
// Regular) from the provider identifier and the plan text returned by the API.
function getPlanType(plan = {}) {
  const provider = String(plan.provider || '').toLowerCase();
  const hay = [
    provider,
    plan.metadata?.description,
    plan.description,
    plan.planName,
    plan.metadata?.label,
  ].filter(Boolean).join(' ').toLowerCase();

  if (hay.includes('corporate') && (hay.includes('gifting') || hay.includes('gift'))) return 'Corporate Gifting';
  if (hay.includes('corporate')) return 'Corporate';
  if (hay.includes('gifting') || hay.includes('gift')) return 'Gifting';
  if (hay.includes('sme')) return 'SME';
  if (hay.includes('special')) return 'Special';
  if (hay.includes('data share') || hay.includes('data_share') || hay.includes('share')) return 'Data Share';
  return 'Regular';
}

// Extract the validity (in days) from a plan. Checks in order of authority:
//  1. plan.metadata            (provider-reported, e.g. "GIFTING - 30")
//  2. plan.description         (mirrors the metadata description)
//  3. plan.planName            (display label, only explicit unit patterns)
function getDurationDays(plan = {}) {
  const meta     = plan.metadata || {};
  const metaText = [meta.validity, meta.month_validate, meta.description]
    .filter((v) => v != null && v !== '').join(' ').toLowerCase();
  const descText = String(plan.description || '').toLowerCase();
  const nameText = String(plan.planName || '').toLowerCase();

  // Parse explicit units OR bare numbers (validity), skipping GB/MB sizes.
  const parseText = (text) => {
    const unitMatch = text.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|weeks?|days?|day)/);
    if (unitMatch) {
      const value = parseFloat(unitMatch[1]);
      const unit  = unitMatch[2];
      if (unit[0] === 'y') return Math.round(value * 365);
      if (unit.startsWith('month')) return Math.round(value * 30);
      if (unit[0] === 'w') return Math.round(value * 7);
      return Math.round(value);
    }
    const cleaned = text.replace(/\d+(?:\.\d+)?\s*(gb|mb|tb|kb)\b/g, ' ');
    const nums = (cleaned.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= 3650);
    if (nums.length) return Math.max(...nums);
    return null;
  };

  if (metaText.trim()) {
    const fromMeta = parseText(metaText);
    if (fromMeta != null) return fromMeta;
  }
  if (descText.trim()) {
    const fromDesc = parseText(descText);
    if (fromDesc != null) return fromDesc;
  }

  // Plan name only counts when it carries an explicit unit ("30 Days", "1 Month")
  const nameUnit = nameText.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|weeks?|days?|day)/);
  if (nameUnit) {
    const value = parseFloat(nameUnit[1]);
    const unit  = nameUnit[2];
    if (unit[0] === 'y') return Math.round(value * 365);
    if (unit.startsWith('month')) return Math.round(value * 30);
    if (unit[0] === 'w') return Math.round(value * 7);
    return Math.round(value);
  }

  return null;
}

// Human-readable duration label (e.g. 7 -> "7 Days", 90 -> "3 Months").
function getDurationLabel(days) {
  if (days == null) return 'Duration varies';
  if (days % 365 === 0 && days >= 365) return days === 365 ? '1 Year' : `${days / 365} Years`;
  if (days % 30 === 0 && days >= 30) return days === 30 ? '1 Month' : `${days / 30} Months`;
  return `${days} Day${days === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BuyDataScreen = ({ navigation }) => {
  const dispatch      = useDispatch();
  const walletBalance = useSelector((state) => state.wallet.balance);
  const authUser      = useSelector((state) => state.auth.user);

  // Networks are always the 4 canonical ones (MTN, Airtel, GLO, 9mobile).
  // Plan types + durations are derived from the loaded plans.
  const [selectedNetwork,   setSelectedNetwork]   = useState(NETWORKS[0].identifier);
  const [selectedPlanType,  setSelectedPlanType]  = useState('All');   // plan type chips
  const [selectedDuration,  setSelectedDuration]  = useState('All');   // duration chips
  const [allPlans,          setAllPlans]          = useState([]);      // all data plans from DB
  const [selectedPlan,      setSelectedPlan]      = useState(null);
  const [phone,             setPhone]             = useState('');

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

        // Default to the first canonical network that actually has plans
        // (fallback: MTN)
        const firstNetworkWithPlans = NETWORKS.find((net) =>
          plans.some((p) => getNetworkFromProvider(p.provider) === net.identifier)
        );
        setSelectedNetwork(firstNetworkWithPlans ? firstNetworkWithPlans.identifier : NETWORKS[0].identifier);

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
  // Plans for selected network (normalized to the 4 canonical networks)
  // ---------------------------------------------------------------------------
  const networkPlans = useMemo(() => {
    if (!selectedNetwork) return [];
    return allPlans.filter((p) => getNetworkFromProvider(p.provider) === selectedNetwork);
  }, [allPlans, selectedNetwork]);

  // ---------------------------------------------------------------------------
  // Plan types available for the selected network (e.g. Gifting, SME, ...)
  // ---------------------------------------------------------------------------
  const planTypes = useMemo(() => {
    const types = new Set(networkPlans.map((p) => getPlanType(p)));
    return Array.from(types).sort(
      (a, b) => PLAN_TYPE_ORDER.indexOf(a) - PLAN_TYPE_ORDER.indexOf(b)
    );
  }, [networkPlans]);

  // ---------------------------------------------------------------------------
  // Plans for the selected plan type
  // ---------------------------------------------------------------------------
  const typePlans = useMemo(() => {
    if (!selectedPlanType || selectedPlanType === 'All') return networkPlans;
    return networkPlans.filter((p) => getPlanType(p) === selectedPlanType);
  }, [networkPlans, selectedPlanType]);

  // ---------------------------------------------------------------------------
  // Duration filters available for the current selection (sorted asc)
  // ---------------------------------------------------------------------------
  const durationFilters = useMemo(() => {
    const byLabel = new Map(); // label -> days (for sorting)
    typePlans.forEach((p) => {
      const days  = getDurationDays(p);
      const label = getDurationLabel(days);
      if (!byLabel.has(label)) byLabel.set(label, days == null ? Infinity : days);
    });
    return Array.from(byLabel.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label);
  }, [typePlans]);

  // ---------------------------------------------------------------------------
  // Filter by duration
  // ---------------------------------------------------------------------------
  const filteredPlans = useMemo(() => {
    if (!selectedDuration || selectedDuration === 'All') return typePlans;
    return typePlans.filter((p) => getDurationLabel(getDurationDays(p)) === selectedDuration);
  }, [typePlans, selectedDuration]);

  // ---------------------------------------------------------------------------
  // Network switch — reset plan type/duration/plan selection
  // ---------------------------------------------------------------------------
  const handleNetworkChange = useCallback((identifier) => {
    setSelectedNetwork(identifier);
    setSelectedPlanType('All');
    setSelectedDuration('All');
    setSelectedPlan(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Plan type switch
  // ---------------------------------------------------------------------------
  const handlePlanTypeChange = useCallback((type) => {
    setSelectedPlanType(type);
    setSelectedDuration('All');
    setSelectedPlan(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Duration filter switch
  // ---------------------------------------------------------------------------
  const handleDurationChange = useCallback((duration) => {
    setSelectedDuration(duration);
    setSelectedPlan(null);
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
        // Send the plan's ACTUAL provider id (e.g. 'mtn_gifting_data') — the
        // backend looks up the plan by its real provider + planCode, and hands
        // it straight to the VTU provider for purchase.
        network:       selectedPlan.provider,
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
    const duration   = getDurationLabel(getDurationDays(item));
    return (
      <TouchableOpacity
        style={[styles.planCard, isSelected && styles.selectedCard]}
        onPress={() => setSelectedPlan(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.planLabel, isSelected && styles.selectedText]} numberOfLines={2}>
          {item.planName}
        </Text>
        <Text style={[styles.planDuration, isSelected && styles.selectedText]} numberOfLines={1}>
          {duration}
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
              {NETWORKS.map((net) => {
                const isSelected = selectedNetwork === net.identifier;
                const color      = net.color;
                return (
                  <TouchableOpacity
                    key={net.identifier}
                    style={[styles.networkItem, isSelected && { borderColor: color, borderWidth: 2 }]}
                    onPress={() => handleNetworkChange(net.identifier)}
                  >
                    <View style={[styles.networkCircle, { backgroundColor: color }]}>
                      <Text style={styles.networkInitial}>{net.label[0]}</Text>
                    </View>
                    <Text style={styles.networkName}>{net.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Plan Type Selection */}
          {!loadingPlans && networkPlans.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Plan Type</Text>
              <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {['All', ...planTypes].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.filterTab, selectedPlanType === type && styles.activeFilterTab]}
                      onPress={() => handlePlanTypeChange(type)}
                    >
                      <Text style={[styles.filterText, selectedPlanType === type && styles.activeFilterText]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </>
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

          {/* Duration Filters */}
          {!loadingPlans && durationFilters.length > 0 && (
            <View style={styles.filterContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['All', ...durationFilters].map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterTab, selectedDuration === filter && styles.activeFilterTab]}
                    onPress={() => handleDurationChange(filter)}
                  >
                    <Text style={[styles.filterText, selectedDuration === filter && styles.activeFilterText]}>
                      {filter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

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
                <Text style={styles.emptyText}>No plans available for this selection.</Text>
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
  planLabel:         { ...FONTS.medium, fontSize: 11, color: COLORS.textPrimary, textAlign: 'center', marginBottom: 3 },
  planDuration:      { ...FONTS.regular, fontSize: 10, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 6 },
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