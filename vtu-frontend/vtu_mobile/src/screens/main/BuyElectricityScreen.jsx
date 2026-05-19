import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';

const DISCOS = [
    { id: 'ikeja-electric', name: 'Ikeja Electric (IKEDC)' },
    { id: 'eko-electric', name: 'Eko Electric (EKEDC)' },
    { id: 'abuja-electric', name: 'Abuja Electric (AEDC)' },
    { id: 'ibadan-electric', name: 'Ibadan Electric (IBEDC)' },
];

const BuyElectricityScreen = ({ navigation }) => {
  const [disco, setDisco] = useState(DISCOS[0]); // Default to first
  const [meterNumber, setMeterNumber] = useState('');
  const [meterType, setMeterType] = useState('prepaid'); // prepaid or postpaid
  const [amount, setAmount] = useState('');
  const [customerInfo, setCustomerInfo] = useState(null); // { name, address }

  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);

  const API_URL = Platform.OS === 'android' ? 'https://vtu-project.vercel.app' : 'https://vtu-project.vercel.app';
  const TENANT_ID = 'clientA';

  const validateMeter = async () => {
      if(meterNumber.length < 10) return;
      setIsVerifying(true);
      setCustomerInfo(null);

      // Simulate API Logic
      setTimeout(() => {
          setIsVerifying(false);
          setCustomerInfo({ name: "MRS SARAH CONNOR", address: "Plot 42, Silicon Valley, Lagos" });
      }, 1500);
      
      // Actual Integration:
      // const res = await axios.get(`${API_URL}/api/v1/vtu/lookup/meter?number=${meterNumber}&provider=${disco.id}`);
  };

  const handlePurchase = async () => {
      setIsLoading(true);
      setTimeout(() => {
          setIsLoading(false);
          Alert.alert("Token Generated", "Token: 4455-6677-8899-0000", [{ text: "Copy", onPress: () => navigation.goBack() }]);
      }, 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
         <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Electricity Token</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Disco Selector */}
        <Text style={styles.label}>Select Provider</Text>
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.selectorText}>{disco.name}</Text>
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

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

        <View style={styles.card}>
            {/* Meter Input & Verify */}
             <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                    <CustomInput 
                        label="Meter Number"
                        placeholder="Enter meter number"
                        value={meterNumber}
                        onChangeText={(t) => { setMeterNumber(t); setCustomerInfo(null); }}
                        keyboardType="numeric"
                        containerStyle={{ marginBottom: 0 }}
                    />
                </View>
                <TouchableOpacity 
                    style={styles.verifyBtn} 
                    onPress={validateMeter}
                    disabled={isVerifying || meterNumber.length < 10}
                >
                     {isVerifying ? <ActivityIndicator color="white" size="small"/> : <Text style={styles.verifyText}>Verify</Text>}
                </TouchableOpacity>
            </View>

            {/* Validation Result */}
            {customerInfo && (
                <View style={styles.verifiedBox}>
                    <Text style={styles.verifiedName}>{customerInfo.name}</Text>
                    <Text style={styles.verifiedAddress}>{customerInfo.address}</Text>
                </View>
            )}

            <View style={{ height: 20 }} />

            {/* Amount Input */}
            <CustomInput
                label="Amount (₦)"
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                style={{ opacity: customerInfo ? 1 : 0.5 }}
                editable={!!customerInfo} // Disable until verified
            />
        </View>

      </ScrollView>

      <View style={styles.footer}>
         <CustomButton 
            label={isLoading ? "Processing..." : "Purchase Token"}
            onPress={handlePurchase}
            disabled={!customerInfo || !amount}
            isLoading={isLoading}
         />
      </View>

      {/* Disco Modal */}
      <Modal visible={isModalVisible} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                 <Text style={styles.modalTitle}>Select Distribution Company</Text>
                 <FlatList 
                    data={DISCOS}
                    keyExtractor={item => item.id}
                    renderItem={({item}) => (
                        <TouchableOpacity 
                            style={styles.discoItem} 
                            onPress={() => { setDisco(item); setModalVisible(false); setCustomerInfo(null); }}
                        >
                            <Text style={styles.discoText}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                 />
                 <TouchableOpacity style={{ alignSelf: 'center', padding: 10 }} onPress={() => setModalVisible(false)}>
                     <Text style={{ color: COLORS.error }}>Cancel</Text>
                 </TouchableOpacity>
              </View>
          </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  header: { flexDirection: 'row', padding: SIZES.padding, justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textWhite },
  content: { padding: SIZES.padding },
  
  label: { ...FONTS.medium, color: COLORS.textWhite, marginBottom: 8 },
  selectorBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceWhite, padding: 16, borderRadius: SIZES.radius, ...SHADOWS.light },
  selectorText: { ...FONTS.semiBold, color: COLORS.textPrimary },

  typeContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: COLORS.surfaceWhite, borderRadius: 10, padding: 4 },
  typeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeTypeBtn: { backgroundColor: COLORS.primary },
  typeText: { ...FONTS.medium, color: COLORS.textSecondary },
  activeTypeText: { color: COLORS.textWhite, ...FONTS.bold },

  card: { backgroundColor: COLORS.surfaceWhite, padding: 20, borderRadius: SIZES.radius, ...SHADOWS.light },
  verifyBtn: { backgroundColor: COLORS.accent, height: 54, width: 80, justifyContent: 'center', alignItems: 'center', borderRadius: SIZES.radius, marginLeft: 10 },
  verifyText: { color: COLORS.primary, ...FONTS.bold },
  
  verifiedBox: { marginTop: 15, backgroundColor: '#E6FFFA', padding: 15, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: COLORS.success },
  verifiedName: { ...FONTS.bold, color: COLORS.textPrimary },
  verifiedAddress: { ...FONTS.regular, color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modalContent: { backgroundColor: 'white', borderRadius: 16, padding: 20, maxHeight: '60%' },
  modalTitle: { ...FONTS.bold, fontSize: SIZES.h3, marginBottom: 20, textAlign: 'center' },
  discoItem: { paddingVertical: 15, borderBottomWidth: 1, borderColor: COLORS.border },
  discoText: { ...FONTS.medium, fontSize: SIZES.body1 },
  footer: { padding: SIZES.padding, backgroundColor: COLORS.surfaceWhite }
});

export default BuyElectricityScreen;