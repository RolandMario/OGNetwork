import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import TransactionPinModal from '../../components/TransactionPinModal';
import TransactionSummaryModal from '../../components/TransactionSummaryModal';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import { updateBalance } from '../../redux/slices/walletSlice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Network colors mapped client-side — Peyflex doesn't provide them
const NETWORK_COLORS = {
  mtn:     '#FFCC00',
  airtel:  '#E60000',
  glo:     '#00C300',
  '9mobile': '#006400',
};

const PRESET_AMOUNTS = ['100', '200', '500', '1000', '2000'];

const BuyAirtimeScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const walletBalance = useSelector((state) => state.wallet.balance);
  const insets = useSafeAreaInsets();

  const [networks, setNetworks]               = useState([]);
  const [selectedNetwork, setSelectedNetwork] = useState('mtn');
  const [phone, setPhone]                     = useState('');
  const [amount, setAmount]                   = useState('');
  const [loadingNetworks, setLoadingNetworks] = useState(true);

  // Get logged-in user's phone number from Redux
  const authUser = useSelector((state) => state.auth.user);

  // PIN modal states
  const [isSummaryModalVisible, setIsSummaryModalVisible] = useState(false); // NEW
  const [summaryTransaction, setSummaryTransaction] = useState(null); // NEW
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isProcessing, setIsProcessing]           = useState(false);
  const [pinError, setPinError]                   = useState('');

  // ---------------------------------------------------------------------------
  // Fetch networks on mount
  // ---------------------------------------------------------------------------
  // Auto-fill phone number from logged-in user's profile
  useEffect(() => {
    if (authUser?.phone) {
      setPhone(authUser.phone);
    }
  }, [authUser]);

  // Hard-coded fallback networks — used if the API returns an empty/invalid list
  const FALLBACK_NETWORKS = [
    { id: 'mtn',     identifier: 'mtn',     label: 'MTN',     color: '#FFCC00' },
    { id: 'airtel',  identifier: 'airtel',  label: 'Airtel',  color: '#E60000' },
    { id: 'glo',     identifier: 'glo',     label: 'Glo',     color: '#00C300' },
    { id: '9mobile', identifier: '9mobile', label: '9mobile', color: '#006400' },
  ];

  useEffect(() => {
    const fetchNetworks = async () => {
      setLoadingNetworks(true);
      try {
        // FIX: correct endpoint path
        const response = await apiClient.get(API_ROUTES.VTU.AIRTIME_NETWORKS);
        console.log('[BuyAirtime] Networks response:', JSON.stringify(response.data));

        // Handle multiple response shapes:
        //  - { data: { networks: [{ id, name }] } }   (our standard / Peyflex)
        //  - { data: { networks: [{ identifier }] } } (some providers)
        //  - { data: { data_plans: [...] } }          (raw Gladtidings)
        const body = response.data?.data || {};
        let raw = body.networks || [];

        // Fallback 1: if no `networks` key but `data_plans` exists (raw provider shape),
        // extract unique network names.
        if (!raw.length && Array.isArray(body.data_plans)) {
          raw = body.data_plans
            .map((entry) => ({ id: entry.name, name: entry.name }))
            .filter((entry, i, arr) => arr.findIndex((e) => e.id === entry.id) === i);
        }

        // Map to what the UI needs
        const mapped = raw
          .map((net) => {
            const id = net.id || net.identifier || net.name;
            return {
              id:         String(id || '').toLowerCase(),
              identifier: id,
              label:      net.name || net.label || id,
              color:      NETWORK_COLORS[String(id || '').toLowerCase()] || '#888888',
            };
          })
          .filter((n) => n.id && n.label);

        // If API returned nothing usable, fall back to hard-coded networks
        const finalNetworks = mapped.length ? mapped : FALLBACK_NETWORKS;
        setNetworks(finalNetworks);

        // Default to first network if mtn not present
        if (finalNetworks.length && !finalNetworks.find((n) => n.id === 'mtn')) {
          setSelectedNetwork(finalNetworks[0].id);
        }
      } catch (err) {
        console.error('[BuyAirtime] Failed to load networks:', err.message);
        // Fallback to static networks so the screen remains usable
        setNetworks(FALLBACK_NETWORKS);
      } finally {
        setLoadingNetworks(false);
      }
    };

    fetchNetworks();
  }, []); // fetch once on mount — network list doesn't change per selection

  // ---------------------------------------------------------------------------
  // Validate then open SUMMARY modal (NEW)
  // ---------------------------------------------------------------------------
  const initiatePurchase = async () => {
    if (!phone || phone.length !== 11) {
      Alert.alert('Invalid Phone', 'Please enter a valid 11-digit phone number.');
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) < 50) {
      Alert.alert('Invalid Amount', 'Minimum airtime purchase is ₦50.');
      return;
    }
    if (Number(amount) > walletBalance) {
      Alert.alert('Insufficient Balance', `Your wallet balance is ₦${walletBalance.toLocaleString()}.`);
      return;
    }

    setPinError('');

    try {
      const resp = await apiClient.get(`${API_ROUTES.VTU.COMMISSION}?service=airtime`);
      const rate = resp.data?.data?.rate ?? 0;
      const commissionAmount = Number(amount) * Number(rate) / 100;

      setSummaryTransaction({
        serviceType: 'Airtime',
        amount: Number(amount) || 0,
        commission: commissionAmount,
        beneficiary: phone,
        planDetails: selectedNetwork,
        provider: selectedNetwork.toUpperCase(),
        totalAmount: Number(amount) + commissionAmount,
      });
    } catch (err) {
      console.error('[BuyAirtime] Failed to get commission rate:', err.message || err);
      setSummaryTransaction({
        serviceType: 'Airtime',
        amount: Number(amount) || 0,
        commission: 0,
        beneficiary: phone,
        planDetails: selectedNetwork,
        provider: selectedNetwork.toUpperCase(),
        totalAmount: Number(amount) || 0,
      });
    }

    setIsSummaryModalVisible(true);
  };

  // ---------------------------------------------------------------------------
  // Summary modal confirmation — proceed to PIN (NEW)
  // ---------------------------------------------------------------------------
  const onSummaryConfirm = () => {
    setIsSummaryModalVisible(false);
    setIsPinModalVisible(true);
  };

  // ---------------------------------------------------------------------------
  // PIN submitted — call backend
  // ---------------------------------------------------------------------------
  const onPinSubmit = async (pin) => {
    setIsProcessing(true);
    setPinError('');

    try {
      // FIX: correct endpoint, correct field names, correct response check
      const response = await apiClient.post(API_ROUTES.VTU.BUY_AIRTIME, {
        network:       selectedNetwork,   // field name backend expects
        mobile_number: phone,             // FIX: was 'phone', backend expects 'mobile_number'
        amount:        Number(amount),
        pin,                              // PIN verified server-side
      });

      if (response.data?.status === 'success') {  // FIX: was response.data?.success
        setIsPinModalVisible(false);

        // Update wallet balance in Redux immediately from response
        if (response.data.data?.newBalance !== undefined) {
          dispatch(updateBalance(response.data.data.newBalance));
        }

        // Generate + open the shareable receipt; the screen fetches the
        // canonical transaction record from the backend by id.
        navigation.replace('Receipt', { transactionId: response.data.data?.id });
      }
    } catch (error) {
      console.error('[BuyAirtime] Purchase error:', error.response?.data || error.message);

      const status = error.response?.status;
      const msg    = error.response?.data?.message || 'Transaction failed. Please try again.';

      if (status === 403) {
        // PIN not set yet
        setIsPinModalVisible(false);
        Alert.alert(
          'PIN Required',
          'Please set a transaction PIN before making purchases.',
          [{ text: 'Set PIN', onPress: () => navigation.navigate('SetPin') }]
        );
      } else if (status === 401 && msg.toLowerCase().includes('pin')) {
        // Wrong PIN — keep modal open, show error
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
  // Sub-components
  // ---------------------------------------------------------------------------
  const NetworkItem = ({ item, isSelected, onPress }) => (
    <TouchableOpacity style={styles.networkContainer} onPress={onPress} activeOpacity={0.8}>
      <View style={[
        styles.networkCircle,
        { backgroundColor: item.color },
        isSelected && styles.selectedNetworkBorder,
      ]}>
        <Text style={styles.networkLogoText}>
          {item.label?.substring(0, 3).toUpperCase()}
        </Text>
        {isSelected && (
          <View style={styles.checkmarkBadge}>
            <Ionicons name="checkmark" size={12} color="white" />
          </View>
        )}
      </View>
      <Text style={[styles.networkLabel, isSelected && styles.selectedLabelText]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buy Airtime</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
          <Ionicons name="time-outline" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>

          {/* Network Selector */}
          <Text style={styles.sectionLabel}>Select Network</Text>
          {loadingNetworks ? (
            <ActivityIndicator size="large" color={COLORS.accent} style={{ marginVertical: 30 }} />
          ) : (
            <View style={styles.networkRow}>
              {networks.map((net) => (
                <NetworkItem
                  key={net.id}
                  item={net}
                  isSelected={selectedNetwork === net.id}
                  onPress={() => setSelectedNetwork(net.id)}
                />
              ))}
            </View>
          )}

          {/* Input Card */}
          <View style={styles.card}>
            <CustomInput
              label="Phone Number"
              placeholder="080xxxxxxxxx"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={11}
              icon={
                <MaterialCommunityIcons name="contacts" size={24} color={COLORS.accent} />
              }
            />

            <TouchableOpacity
              onPress={() => {
                if (authUser?.phone) {
                  setPhone(authUser.phone);
                } else {
                  Alert.alert('Phone Not Found', 'Please set your phone number in profile settings.');
                }
              }}
              style={styles.selfTopUp}
            >
              <Text style={styles.selfTopUpText}>My Number</Text>
            </TouchableOpacity>

            <CustomInput
              label="Amount (₦)"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />

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

            {/* Balance hint */}
            <Text style={styles.balanceHint}>
              Wallet balance: ₦{Number(walletBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SIZES.padding) }]}>
          <CustomButton
            label={`Pay ₦${amount || '0.00'}`}
            onPress={initiatePurchase}
            variant="primary"
            disabled={!amount || !phone || phone.length !== 11 || loadingNetworks}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Summary Modal */}
      <TransactionSummaryModal
        isVisible={isSummaryModalVisible}
        onClose={() => setIsSummaryModalVisible(false)}
        onConfirm={onSummaryConfirm}
        transaction={summaryTransaction}
      />

      {/* PIN Modal */}
      <TransactionPinModal
        isVisible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onSubmit={onPinSubmit}
        isLoading={isProcessing}
        error={pinError}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: COLORS.primary },
  header:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.padding, paddingVertical: 15 },
  backBtn:               { padding: 4 },
  headerTitle:           { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textWhite },
  content:               { padding: SIZES.padding, paddingBottom: 100 },
  sectionLabel:          { ...FONTS.medium, color: COLORS.textWhite, marginBottom: 15 },
  networkRow:            { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  networkContainer:      { alignItems: 'center', width: '22%' },
  networkCircle:         { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 3, borderColor: 'transparent', ...SHADOWS.light },
  networkLogoText:       { ...FONTS.bold, color: 'white', fontSize: 14 },
  selectedNetworkBorder: { borderColor: COLORS.accent },
  checkmarkBadge:        { position: 'absolute', bottom: -2, right: -2, backgroundColor: COLORS.accent, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.backgroundMain },
  networkLabel:          { ...FONTS.regular, fontSize: SIZES.body2, color: COLORS.textWhite },
  selectedLabelText:     { ...FONTS.bold, color: COLORS.accent },
  card:                  { backgroundColor: COLORS.surfaceWhite, padding: 20, borderRadius: SIZES.radius, ...SHADOWS.light },
  selfTopUp:             { alignSelf: 'flex-start', backgroundColor: '#E6FFFA', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, marginTop: -8, marginBottom: 10 },
  selfTopUpText:         { ...FONTS.medium, fontSize: 12, color: COLORS.accent },
  pillsContainer:        { flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, gap: 10 },
  pill:                  { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundMain },
  activePill:            { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText:              { ...FONTS.medium, color: COLORS.textPrimary },
  activePillText:        { color: COLORS.textWhite },
  balanceHint:           { ...FONTS.regular, fontSize: 12, color: COLORS.textSecondary, marginTop: 15, textAlign: 'right' },
  footer:                { padding: SIZES.padding, backgroundColor: COLORS.surfaceWhite, borderTopWidth: 1, borderTopColor: COLORS.border },
});

export default BuyAirtimeScreen;