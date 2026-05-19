import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import TransactionPinModal from '../../components/TransactionPinModal'; // Reusing the component we made
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- DUMMY DATA FOR DEMONSTRATION ---
// In a real app, you fetch this from /api/v1/data-plans?network=MTN
const DATA_PLANS = [
  { id: '1', network: 'mtn', category: 'daily', size: '100MB', validity: '1 Day', price: '100', planId: '500' },
  { id: '2', network: 'mtn', category: 'daily', size: '200MB', validity: '3 Days', price: '200', planId: '501' },
  { id: '3', network: 'mtn', category: 'weekly', size: '350MB', validity: '7 Days', price: '300', planId: '502' },
  { id: '4', network: 'mtn', category: 'weekly', size: '750MB', validity: '14 Days', price: '500', planId: '503' },
  { id: '5', network: 'mtn', category: 'monthly', size: '1.5GB', validity: '30 Days', price: '1000', planId: '504' },
  { id: '6', network: 'mtn', category: 'monthly', size: '2GB', validity: '30 Days', price: '1200', planId: '505' },
  { id: '7', network: 'mtn', category: 'xtravalue', size: '4GB + 2k Talk', validity: '30 Days', price: '2000', planId: '506' },
  { id: '8', network: 'mtn', category: 'favourite', size: '10GB', validity: '30 Days', price: '3000', planId: '507' },
  // Add other networks...
];



const NETWORK_COLORS = {
  mtn: '#FFCC00',      // Yellow
  glo: '#2ecc71',      // Green
  airtel: '#e74c3c',   // Red
  '9mobile': '#006633' // Dark Green
};

const NETWORK_ID ={
  mtn:"1",
  glo:"3",
  airtel:"2",
  '9mobile':"4"
}

const FILTERS = ['All', 'Favourite', 'Daily', 'Weekly', 'Monthly', 'XtraValue'];

const BuyDataScreen = ({ navigation }) => {
  const [selectedNetwork, setSelectedNetwork] = useState('mtn');
  const [phone, setPhone] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedPlan, setSelectedPlan] = useState(null);
  
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dataPlans, setDataPlans] = useState([])
  const [networks, setNetworks] = useState({})


useEffect(() => {
  
  const loadNetworks = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const API_URL = 'https://vtu-project.vercel.app'
    try {
      const response = await axios.get(`${API_URL}/api/v1/vtu/networks?identifier=${selectedNetwork}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': 'clientA' }
      });
      // Update your state with the dynamic networks from the API
      setNetworks(response.data); 
    } catch (err) {
      console.log("Failed to load networks");
    }
  };
  loadNetworks();
}, [selectedNetwork]);

useEffect(()=>{

    const loadDataPlan = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const API_URL = 'https://vtu-project.vercel.app'
    console.log('network_id', NETWORK_ID[selectedNetwork])
    try {
      const response = await axios.get(`${API_URL}/api/v1/vtu/data-plans?networkId=${NETWORK_ID[selectedNetwork]}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': 'clientA' }
      });
      // Update your state with the dynamic networks from the API
      setDataPlans(response.data.data); 
    } catch (err) {
      console.log("Failed to load networks");
    }
  };
  loadDataPlan();

},[selectedNetwork])

  // Filter Logic
  const filteredPlans = useMemo(() => {
    return networks.dataPlans?.filter(plan => {
      const networkMatch = selectedNetwork;
      const categoryMatch = selectedFilter === 'All' || 
                            "mtn".toLowerCase() === selectedFilter.toLowerCase();
      return networkMatch && categoryMatch;
    });
  }, [selectedNetwork, selectedFilter]);

  const initiatePurchase = () => {
    if (phone.length < 11) {
      Alert.alert("Error", "Please enter a valid phone number");
      return;
    }
    if (!selectedPlan) {
      Alert.alert("Error", "Please select a data plan");
      return;
    }
    // Open PIN Modal
    setIsPinModalVisible(true);
  };

  const handleTransaction = async (pin) => {
    setIsPinModalVisible(false);
    setIsLoading(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      // Replace with your actual endpoint
      const response = await axios.post(
        'https://vtu-project.vercel.app/api/v1/vtu/data',
        {
          network: selectedNetwork,
          phone: phone,
          planId: selectedPlan.planId,
          amount: selectedPlan.price,
          pin: pin 
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': 'clientA'
          }
        }
      );

      if (response.data.success) {
        Alert.alert("Success", "Data purchase successful!");
        navigation.navigate("TransactionSuccess", { receipt: response.data.data });
      }
    } catch (error) {
      const status = error.response?.status;
      if (status === 401) Alert.alert("Failed", "Incorrect PIN");
      else if (status === 424) Alert.alert("Failed", "Provider Error (424). Try again later.");
      else Alert.alert("Error", error.response?.data?.message || "Transaction failed");
    } finally {
      setIsLoading(false);
    }
  };

  const renderPlanCard = ({ item }) => {
    const isSelected = selectedPlan?.id === item.id;
    return (
      <TouchableOpacity 
        style={[styles.planCard, isSelected && styles.selectedCard]}
        onPress={() => setSelectedPlan(item)}
        activeOpacity={0.7}
      >
        <View style={styles.planHeader}>
          <Text style={[styles.planSize, isSelected && styles.selectedText]}>{item.size}</Text>
        </View>
        <Text style={[styles.planValidity, isSelected && styles.selectedSubText]}>{item.validity}</Text>
        <View style={styles.priceTag}>
          <Text style={[styles.planPrice, isSelected && styles.selectedText]}>₦{item.price}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkIcon}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      { console.log('network data ', networks)}
     { console.log('network data plans', dataPlans)}
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
          <View style={styles.networkContainer}>
            {networks.data?.map((net) => (

              
              <TouchableOpacity
                key={net.id}
                style={[
                  styles.networkItem,
                  selectedNetwork === net.id && { borderColor: NETWORK_COLORS[net.identifier], borderWidth: 2 }
                ]}
                onPress={() => setSelectedNetwork(net.identifier)}
              >
                <View style={[styles.networkCircle, { backgroundColor: NETWORK_COLORS[net.identifier]||'#FFCC00' }]}>
                   <Text style={styles.networkInitial}>{net.name[0]}</Text>
                </View>
                <Text style={styles.networkName}>{net.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Phone Input */}
          <Text style={styles.sectionLabel}>Phone Number</Text>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="cellphone" size={24} color={COLORS.gray} />
            <TextInput
              style={styles.input}
              placeholder="08012345678"
              keyboardType="phone-pad"
              maxLength={11}
              value={phone}
              onChangeText={setPhone}
            />
            <TouchableOpacity onPress={() => {/* Open Contacts */}}>
              <Ionicons name="people-circle-outline" size={28} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Filters */}
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterTab,
                    selectedFilter === filter && styles.activeFilterTab
                  ]}
                  onPress={() => setSelectedFilter(filter)}
                >
                  <Text style={[
                    styles.filterText,
                    selectedFilter === filter && styles.activeFilterText
                  ]}>{filter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Plans Grid */}
          <FlatList
            data={filteredPlans}
            keyExtractor={(item) => item.id}
            renderItem={renderPlanCard}
            numColumns={3}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
               <Text style={styles.emptyText}>No plans available for this category.</Text>
            }
          />
        </View>

        {/* Footer / Buy Button */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.buyButton, (!selectedPlan || phone.length < 11) && styles.disabledButton]}
            onPress={initiatePurchase}
            disabled={!selectedPlan || phone.length < 11 || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buyButtonText}>
                {selectedPlan ? `Pay ₦${selectedPlan.price}` : 'Select a Plan'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* Reusing the Pin Modal we created earlier */}
      <TransactionPinModal
        isVisible={isPinModalVisible}
        onClose={() => setIsPinModalVisible(false)}
        // onPinComplete={handleTransaction}
        amount={selectedPlan?.price}
        onSubmit={handleTransaction}
        transactionType="Data Bundle"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundMain },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20,
    backgroundColor: '#FFF' 
  },
  headerTitle: { ...FONTS.bold, fontSize: 18 },
  content: { flex: 1, paddingHorizontal: 20 },
  sectionLabel: { ...FONTS.bold, fontSize: 14, color: COLORS.gray, marginTop: 15, marginBottom: 10 },
  
  // Networks
  networkContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  networkItem: { alignItems: 'center', padding: 5, borderRadius: 10 },
  networkCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  networkInitial: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  networkName: { fontSize: 12, color: COLORS.textPrimary },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: SIZES.radius,
    paddingHorizontal: 15,
    height: 55,
    ...SHADOWS.light
  },
  input: { flex: 1, marginLeft: 10, fontSize: 16, },

  // Filters
  filterContainer: { marginTop: 20, marginBottom: 10, height: 40 },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    marginRight: 10,
    justifyContent: 'center'
  },
  activeFilterTab: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 12, color: COLORS.textPrimary },
  activeFilterText: { color: '#FFF', fontWeight: 'bold' },

  // Grid
  gridContent: { paddingBottom: 100, paddingTop: 10 },
  columnWrapper: { justifyContent: 'space-between' },
  planCard: {
    width: '31%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    ...SHADOWS.light,
    position: 'relative'
  },
  selectedCard: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary, // Or keep white with thick border
  },
  planHeader: { marginBottom: 5 },
  planSize: { fontSize: 16, fontWeight: 'bold', color: COLORS.textPrimary },
  planValidity: { fontSize: 10, color: COLORS.gray, marginBottom: 8 },
  priceTag: { backgroundColor: '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  planPrice: { fontSize: 12, fontWeight: 'bold', color: '#166534' },
  
  selectedText: { color: '#FFF' },
  selectedSubText: { color: '#E2E8F0' },
  
  checkIcon: { position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 10 },
  
  emptyText: { textAlign: 'center', color: COLORS.gray, marginTop: 20 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#EEE'
  },
  buyButton: {
    backgroundColor: COLORS.primary,
    height: 55,
    borderRadius: SIZES.radius,
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabledButton: { backgroundColor: '#CBD5E1' },
  buyButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});

export default BuyDataScreen;