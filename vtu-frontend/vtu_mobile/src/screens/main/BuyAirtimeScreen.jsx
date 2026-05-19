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
  ScrollView
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
// Ensure this path matches where you saved the component from the previous step
import TransactionPinModal from '../../components/TransactionPinModal';

const BuyAirtimeScreen = ({ navigation }) => {
  const [network, setNetwork] = useState({});
  const [selectedNetwork, setSelectedNetwork] = useState('mtn')
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  
  // State for Modal & Processing
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinError, setPinError] = useState('');

  // --- CONFIGURATION ---
  const API_URL = 'https://vtu-project.vercel.app'; 
  const TENANT_ID = 'clientA';

  // Quick Amount Pills
  const PRESET_AMOUNTS = ['100', '200', '500', '1000', '2000'];

  // Network Options
  const NETWORKS = [
    { id: 'mtn', label: 'MTN', color: '#FFCC00' },
    { id: 'airtel', label: 'Airtel', color: '#E60000' },
    { id: 'glo', label: 'Glo', color: '#00C300' },
    { id: '9mobile', label: '9mobile', color: '#006400' },
  ];


  useEffect(()=>{
    const fetchNetworkDetails = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const API_URL = 'https://vtu-project.vercel.app'
    try {
      const response = await axios.get(`${API_URL}/api/v1/vtu/airtime-networks?identifier=${selectedNetwork}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': 'clientA' }
      });
      // Update your state with the dynamic networks from the API
      setNetwork(response.data); 
    } catch (err) {
      console.log("Failed to load networks");
    }
    }
    fetchNetworkDetails()
  }, [selectedNetwork])
  // 1. PHASE ONE: Validation & Modal Open
  const initiatePurchase = () => {
    // Validation
    if (!phone || phone.length < 11) {
      Alert.alert('Invalid Phone', 'Please enter a valid 11-digit phone number.');
      return;
    }
    if (!amount || isNaN(amount) || Number(amount) < 50) {
      Alert.alert('Invalid Amount', 'Minimum airtime purchase is ₦50.');
      return;
    }
    
    // If valid, clear errors and show PIN Modal
    setPinError('');
    setIsPinModalVisible(true);
  };

  // 2. PHASE TWO: API Execution (Called by Modal)
  const onPinSubmit = async (pin) => {
    setIsProcessing(true); // Loading spinner on the Modal button
    setPinError('');

    try {
      const token = await AsyncStorage.getItem('userToken');

      // Call Backend API
      const response = await axios.post(
        `${API_URL}/api/v1/vtu/airtime`,
        {
          phone,
          amount: Number(amount),
          selectedNetwork, // e.g., 'mtn'
          pin: pin // <--- SEND PIN TO BACKEND FOR VERIFICATION
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('BuyAirtime response', response.data);

      // Handle Success
      if (response.data.success) {
        setIsProcessing(false);
        setIsPinModalVisible(false); // Close Modal

        Alert.alert(
          'Transaction Successful',
          `You successfully sent ₦${amount} ${selectedNetwork.toUpperCase()} airtime to ${phone}.`,
          [{ text: 'Great!', onPress: () => navigation.goBack() }]
        );
      }

    } catch (error) {
      console.error(error.response.status);
      if(error.response.status===403){
        navigation.replace('SetPin')
      } else 
        if(error.response.status===401){
          setPinError('Wrong Transaction pin')
        } 
      setIsProcessing(false);
      
      const msg = error.response?.data?.message || 'Transaction failed.';
      
      // If the error is specifically about the PIN, show it on the modal
      if (msg.toLowerCase().includes('pin')) {
          setPinError(msg);
      } else {
          // For other errors (network, balance), close modal and alert
          setIsPinModalVisible(false);
          Alert.alert('Purchase Failed', msg);
      }
    }
  };

  // --- Render Components ---

  const NetworkItem = ({ item, isSelected, onPress }) => (
    <TouchableOpacity style={styles.networkContainer} onPress={onPress} activeOpacity={0.8}>
      <View style={[
        styles.networkCircle, 
        { backgroundColor: item.color },
        isSelected && styles.selectedNetworkBorder
      ]}>
        <Text style={styles.networkLogoText}>{item.identifier.substring(0, 1)}</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      {console.log("fetched networks: ", network )}
        {console.log("selected network: ", selectedNetwork )}
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundMain} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buy Airtime</Text>
        <TouchableOpacity>
           <Ionicons name="time-outline" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          
          {/* 1. Network Selector */}
          <Text style={styles.sectionLabel}>Select Network</Text>
          <View style={styles.networkRow}>
            {network.data?.map((net) => (
              <NetworkItem 
                key={net.id} 
                item={net} 
                isSelected={selectedNetwork === net.id}
                onPress={() => setSelectedNetwork(net.id)}
              />
            ))}
          </View>

          {/* 2. Input Card */}
          <View style={styles.card}>
            
            {/* Phone Input */}
            <CustomInput
              label="Phone Number"
              placeholder="080..."
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={11}
              icon={
                <TouchableOpacity onPress={() => Alert.alert("Contacts", "Contact picker would open here")}>
                  <MaterialCommunityIcons name="contacts" size={24} color={COLORS.accent} />
                </TouchableOpacity>
              }
            />

            {/* Self Top-up Pill */}
            <TouchableOpacity onPress={() => setPhone('07068497568')} style={styles.selfTopUp}>
                <Text style={styles.selfTopUpText}>My Number</Text>
            </TouchableOpacity>

            <View style={{ height: 20 }} />

            {/* Amount Input */}
            <CustomInput
              label="Amount"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />

            {/* Quick Amount Pills */}
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

        </ScrollView>

        {/* Footer Button */}
        <View style={styles.footer}>
          <CustomButton
            label={`Pay ₦${amount || '0.00'}`}
            onPress={initiatePurchase} // Calls validation first
            variant="primary"
            disabled={!amount || !phone || phone.length < 11}
          />
        </View>
      </KeyboardAvoidingView>

      {/* --- INTEGRATED PIN MODAL --- */}
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

// ... Styles remain exactly the same as provided ...
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
  headerTitle: {
    ...FONTS.bold,
    fontSize: SIZES.h3,
    color: COLORS.textWhite,
  },
  content: {
    padding: SIZES.padding,
    paddingBottom: 100,
  },
  sectionLabel: {
    ...FONTS.medium,
    color: COLORS.textWhite,
    marginBottom: 15,
  },
  // Network Styles
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  networkContainer: {
    alignItems: 'center',
    width: '22%',
  },
  networkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    ...SHADOWS.light,
  },
  networkLogoText: {
    ...FONTS.bold,
    color: 'white',
    fontSize: 20,
  },
  selectedNetworkBorder: {
    borderColor: COLORS.accent, // Teal border indicates selection
  },
  checkmarkBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.accent,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.backgroundMain,
  },
  networkLabel: {
    ...FONTS.regular,
    fontSize: SIZES.body2,
    color: COLORS.textWhite,
  },
  selectedLabelText: {
    ...FONTS.bold,
    color: COLORS.textPrimary,
  },
  // Card & Input Styles
  card: {
    backgroundColor: COLORS.surfaceWhite,
    padding: 20,
    borderRadius: SIZES.radius,
    ...SHADOWS.light,
  },
  selfTopUp: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6FFFA',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginTop: -10, // Pull closer to input
    marginBottom: 5,
  },
  selfTopUpText: {
    ...FONTS.medium,
    fontSize: 12,
    color: COLORS.accent,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 15,
    gap: 10,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundMain,
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
  footer: {
    padding: SIZES.padding,
    backgroundColor: COLORS.surfaceWhite,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  }
});

export default BuyAirtimeScreen;