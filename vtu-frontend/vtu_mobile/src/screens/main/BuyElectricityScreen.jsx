import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Modal, FlatList,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import TransactionPinModal from '../../components/TransactionPinModal';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import { updateBalance } from '../../redux/slices/walletSlice';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BuyElectricityScreen = ({ navigation }) => {
  const dispatch      = useDispatch();
  const walletBalance = useSelector((state) => state.wallet.balance);

  const [discos,          setDiscos]          = useState([]);
  const [selectedDisco,   setSelectedDisco]   = useState(null);
  const [meterType,       setMeterType]       = useState('prepaid');
  const [meterNumber,     setMeterNumber]     = useState('');
  const [amount,          setAmount]          = useState('');
  const [customerInfo,    setCustomerInfo]    = useState(null);

  const [loadingDiscos,   setLoadingDiscos]   = useState(true);
  const [isVerifying,     setIsVerifying]     = useState(false);
  const [isModalVisible,  setModalVisible]    = useState(false);
  const [isPinModalVisible,setIsPinModalVisible] = useState(false);
  const [isProcessing,    setIsProcessing]    = useState(false);
  const [pinError,        setPinError]        = useState('');

  // ---------------------------------------------------------------------------
  // Fetch electricity plans (DISCOs) from DB on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchDiscos = async () => {
      setLoadingDiscos(true);
      try {
        const response = await apiClient.get(API_ROUTES.VTU.ELECTRICITY_PLANS);
        const plans = response.data?.data?.plans || [];
        setDiscos(plans);
        if (plans.length) setSelectedDisco(plans[0]);
      } catch (err) {
        console.error('[BuyElectricity] Failed to load DISCOs:', err.message);
        Alert.alert('Error', 'Failed to load electricity providers. Please try again.');
      } finally {
        setLoadingDiscos(false);
      }
    };

    fetchDiscos();
  }, []);

  // ---------------------------------------------------------------------------
  // Validate amount against min/max from plan metadata
  // ---------------------------------------------------------------------------
  const validateAmount = useCallback((val) => {
    if (!selectedDisco) return null;
    const num = Number(val);
    const min = selectedDisco.metadata?.min_amount || 100;
    const max = selectedDisco.metadata?.max_amount || 1000000;
    if (isNaN(num) || num <= 0) return 'Please enter a valid amount.';
    if (num < min) return `Minimum amount is ₦${min.toLocaleString()}.`;
    if (num > max) return `Maximum amount is ₦${max.toLocaleString()}.`;
    return null;
  }, [selectedDisco]);

  // ---------------------------------------------------------------------------
  // Verify meter number
  // ---------------------------------------------------------------------------
  const handleVerify = async () => {
    if (!meterNumber || meterNumber.length < 10) {
      Alert.alert('Invalid Meter', 'Please enter a valid meter number (at least 10 digits).');
      return;
    }
    if (!selectedDisco) {
      Alert.alert('No Provider', 'Please select an electricity provider.');
      return;
    }

    setIsVerifying(true);
    setCustomerInfo(null);

    try {
      // GET /vtu/electricity/verify?meter=XXX&plan=ikeja-electric&type=prepaid
      const response = await apiClient.get(API_ROUTES.VTU.ELECTRICITY_VERIFY, {
        params: {
          meter: meterNumber,
          plan:  selectedDisco.planCode,
          type:  meterType,
        },
      });

      if (response.data?.status === 'success') {
        const d = response.data.data;
        setCustomerInfo({
          name:    d.customer_name || 'Verified',
          message: d.message || 'Meter verification successful',
        });
      }
    } catch (err) {
      console.error('[BuyElectricity] Verify error:', err.response?.data || err.message);
      Alert.alert(
        'Verification Failed',
        err.response?.data?.message || 'Could not verify meter. Please check the number and try again.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Initiate purchase — validate then open PIN modal
  // ---------------------------------------------------------------------------
  const initiatePurchase = () => {
    if (!customerInfo) {
      Alert.alert('Verification Required', 'Please verify your meter number first.');
      return;
    }

    const amountError = validateAmount(amount);
    if (amountError) {
      Alert.alert('Invalid Amount', amountError);
      return;
    }

    if (Number(amount) > walletBalance) {
      Alert.alert(
        'Insufficient Balance',
        `You need ₦${Number(amount).toLocaleString()} but your balance is ₦${walletBalance.toLocaleString()}.`
      );
      return;
    }

    setPinError('');
    setIsPinModalVisible(true);
  };

  // ---------------------------------------------------------------------------
  // PIN submitted — call backend
  // ---------------------------------------------------------------------------
  const onPinSubmit = async (pin) => {
    setIsProcessing(true);
    setPinError('');

    try {
      const response = await apiClient.post(API_ROUTES.VTU.BUY_ELECTRICITY, {
        plan:   selectedDisco.planCode,
        meter:  meterNumber,
        amount: Number(amount),
        phone:  meterNumber, // Peyflex requires phone; use meter as fallback
        type:   meterType,
        pin,
      });

      if (response.data?.status === 'success') {
        setIsPinModalVisible(false);

        if (response.data.data?.newBalance !== undefined) {
          dispatch(updateBalance(response.data.data.newBalance));
        }

        const token = response.data.data?.token || 'Check your meter for the token';

        Alert.alert(
          '✅ Electricity Purchase Successful',
          `Meter: ${meterNumber}\nToken: ${token}\nAmount: ₦${Number(amount).toLocaleString()}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }

    } catch (error) {
      console.error('[BuyElectricity] Purchase error:', error.response?.data || error.message);
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
  const minAmount = selectedDisco?.metadata?.min_amount || 100;
  const maxAmount = selectedDisco?.metadata?.max_amount || 1000000;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Electricity Token</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* DISCO Selector */}
        <Text style={styles.label}>Select Provider</Text>
        {loadingDiscos ? (
          <ActivityIndicator color="#FFF" style={{ marginVertical: 20 }} />
        ) : (
          <TouchableOpacity style={styles.selectorBtn} onPress={() => setModalVisible(true)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectorText}>{selectedDisco?.planName || 'Select provider'}</Text>
              {selectedDisco && (
                <Text style={styles.selectorSubText}>
                  Min: ₦{minAmount.toLocaleString()} — Max: ₦{maxAmount.toLocaleString()}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={{ height: 20 }} />

        {/* Meter Type Switch */}
        <View style={styles.typeContainer}>
          <TouchableOpacity
            style={[styles.typeBtn, meterType === 'prepaid' && styles.activeTypeBtn]}
            onPress={() => setMeterType('prepaid')}
          >
            <Text style={[styles.typeText, meterType === 'prepaid' && styles.activeTypeText]}>Prepaid</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, meterType === 'postpaid' && styles.activeTypeBtn]}
            onPress={() => setMeterType('postpaid')}
          >
            <Text style={[styles.typeText, meterType === 'postpaid' && styles.activeTypeText]}>Postpaid</Text>
          </TouchableOpacity>
        </View>

        {/* Meter Input + Verify */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <CustomInput
                label="Meter Number"
                placeholder="Enter meter number"
                value={meterNumber}
                onChangeText={(t) => {
                  setMeterNumber(t);
                  setCustomerInfo(null);
                }}
                keyboardType="numeric"
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.verifyBtn,
                (isVerifying || meterNumber.length < 10) && styles.verifyBtnDisabled,
              ]}
              onPress={handleVerify}
              disabled={isVerifying || meterNumber.length < 10}
            >
              {isVerifying
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={styles.verifyText}>Verify</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Verification Result */}
          {customerInfo && (
            <View style={styles.verifiedBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
                <Text style={styles.verifiedName}>{customerInfo.name}</Text>
              </View>
              <Text style={styles.verifiedAddress}>{customerInfo.message}</Text>
            </View>
          )}

          <View style={{ height: 20 }} />

          {/* Amount Input */}
          <CustomInput
            label={`Amount (₦) — Min: ₦${minAmount.toLocaleString()}`}
            placeholder={`Min ₦${minAmount.toLocaleString()}`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            editable={!!customerInfo}
            containerStyle={{ opacity: customerInfo ? 1 : 0.5 }}
          />

          {/* Balance hint */}
          <Text style={styles.balanceHint}>
            Wallet balance: ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </Text>
        </View>

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <CustomButton
          label="Purchase Token"
          onPress={initiatePurchase}
          disabled={!customerInfo || !amount || isProcessing}
          isLoading={isProcessing}
        />
      </View>

      {/* DISCO Picker Modal */}
      <Modal visible={isModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Distribution Company</Text>
            <FlatList
              data={discos}
              keyExtractor={(item) => item.planCode}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.discoItem}
                  onPress={() => {
                    setSelectedDisco(item);
                    setModalVisible(false);
                    setCustomerInfo(null);
                    setMeterNumber('');
                    setAmount('');
                  }}
                >
                  <Text style={styles.discoText}>{item.planName}</Text>
                  <Text style={styles.discoSubText}>
                    Min ₦{(item.metadata?.min_amount || 0).toLocaleString()} —
                    Max ₦{(item.metadata?.max_amount || 0).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={{ alignSelf: 'center', padding: 12 }}
              onPress={() => setModalVisible(false)}
            >
              <Text style={{ color: COLORS.error || '#e74c3c', ...FONTS.medium }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PIN Modal */}
      <TransactionPinModal
        isVisible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        onSubmit={onPinSubmit}
        isLoading={isProcessing}
        error={pinError}
        transactionType="Electricity"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.primary },
  header:           { flexDirection: 'row', padding: SIZES.padding, justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:      { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textWhite },
  content:          { padding: SIZES.padding, paddingBottom: 120 },
  label:            { ...FONTS.medium, color: COLORS.textWhite, marginBottom: 8 },
  selectorBtn:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: SIZES.radius, ...SHADOWS.light },
  selectorText:     { ...FONTS.semiBold, color: COLORS.textPrimary },
  selectorSubText:  { ...FONTS.regular, fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  typeContainer:    { flexDirection: 'row', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 4 },
  typeBtn:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeTypeBtn:    { backgroundColor: '#FFF' },
  typeText:         { ...FONTS.medium, color: 'rgba(255,255,255,0.8)' },
  activeTypeText:   { color: COLORS.primary, ...FONTS.bold },
  card:             { backgroundColor: '#FFF', padding: 20, borderRadius: SIZES.radius, ...SHADOWS.light },
  verifyBtn:        { backgroundColor: COLORS.accent || '#F5A623', height: 54, width: 80, justifyContent: 'center', alignItems: 'center', borderRadius: SIZES.radius, marginLeft: 10 },
  verifyBtnDisabled:{ backgroundColor: '#CBD5E1' },
  verifyText:       { color: COLORS.primary, ...FONTS.bold },
  verifiedBox:      { marginTop: 15, backgroundColor: '#E6FFFA', padding: 15, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#27AE60' },
  verifiedName:     { ...FONTS.bold, color: COLORS.textPrimary, marginLeft: 6 },
  verifiedAddress:  { ...FONTS.regular, color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  balanceHint:      { ...FONTS.regular, fontSize: 12, color: COLORS.textSecondary, textAlign: 'right', marginTop: 8 },
  footer:           { padding: SIZES.padding, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EEE' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modalContent:     { backgroundColor: '#FFF', borderRadius: 16, padding: 20, maxHeight: '70%' },
  modalTitle:       { ...FONTS.bold, fontSize: SIZES.h3, marginBottom: 20, textAlign: 'center' },
  discoItem:        { paddingVertical: 15, borderBottomWidth: 1, borderColor: '#EEE' },
  discoText:        { ...FONTS.medium, fontSize: SIZES.body1, color: COLORS.textPrimary },
  discoSubText:     { ...FONTS.regular, fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
});

export default BuyElectricityScreen;