import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Assuming Expo, or use your icon lib
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
const CABLE_PROVIDERS = [
  { id: 'dstv', name: 'DStv', color: '#00A3E0', inputType: 'smartcard' },
  { id: 'gotv', name: 'GOtv', color: '#88C540', inputType: 'smartcard' },
  { id: 'startimes', name: 'StarTimes', color: '#FF6600', inputType: 'smartcard' },
  { id: 'showmax', name: 'Showmax', color: '#E40046', inputType: 'phone' },
];

// Mock Data for visualization
const MOCK_PLANS = [
  { code: 'p1', name: 'Padi', price: '2,500' },
  { code: 'p2', name: 'Yanga', price: '3,500' },
  { code: 'p3', name: 'Confam', price: '6,200' },
  { code: 'p4', name: 'Compact', price: '10,500' },
  { code: 'p5', name: 'Compact Plus', price: '16,600' },
  { code: 'p6', name: 'Premium', price: '24,500' },
];

const BuyCableScreen = () => {
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [customerInput, setCustomerInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [customerName, setCustomerName] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [cableProviders, setCableProviders] = useState([])
  const [fetchedPlan, setFetchedPlan] = useState([])
  const [customerData, setCustomerData] = useState(null)
  const [paymentSuccessful, setPaymentSuccessful] = useState(false)

  const API_URL = 'https://vtu-project.vercel.app'; 
  const TENANT_ID = 'clientA';
//const cableArray =[];
  useEffect(()=>{
    const fetchCablesDetails = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const API_URL = 'https://vtu-project.vercel.app'
    try {
      const response = await axios.get(`${API_URL}/api/v1/vtu/cable-types`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': 'clientA' }
      });
     const cableArray = response.data.data.data.product

      cableArray.map(cable=>{
          if(cable.cableType==='DSTV'){
            cable['color']= '#00A3E0',
            cable['inputType']= 'smartcard'
          }else if(cable.cableType==='GOTV'){
            cable['color']= '#88C540',
            cable['inputType']= 'smartcard'
          }else if(cable.cableType==='STARTIMES'){
            cable['color']= '#FF6600',
            cable['inputType']= 'smartcard'
          }else{
            cable['color']= '#E40046',
            cable['inputType']= 'phone'    
          }
      })
      // Update your state with the dynamic networks from the API
      setCableProviders(cableArray); 
      
    } catch (err) {
      console.log("Failed to load cables providers");
    }
    }
    fetchCablesDetails()
  },[])

  useEffect(()=>{
    setSelectedProvider(cableProviders[0]||{"cableId": 1, "cableType": "DSTV", "color": "#00A3E0", "inputType": "smartcard"})
  },[cableProviders])


  useEffect(()=>{
        const fetchCablesPackages = async () => {
    const token = await AsyncStorage.getItem('userToken');
    const API_URL = 'https://vtu-project.vercel.app'
    try {
      const response = await axios.get(`${API_URL}/api/v1/vtu/cable-packages?cableType=${selectedProvider.cableType||"DSTV"}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': 'clientA' }
      });
     const cablePackages = response.data.data.data.product

    console.log('packages', cablePackages)
      // Update your state with the dynamic networks from the API
      setFetchedPlan(cablePackages); 
      
    } catch (err) {
      console.log("Failed to load cables packages", err);
    }
    }
    fetchCablesPackages()
  },[selectedProvider])

  // --- Handlers ---

  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider);
    setCustomerInput('');
    setCustomerName(null);
    setSelectedPlan(null);
  };
  
  const handleVerify = async() => {
  try {
    if(selectedProvider.cableType === "SHOWMAX"){
      setTimeout(()=>{
      setIsVerifying(false)
      setCustomerName("SUCCESSFUL") 
      }, 3000)

    }
  setIsVerifying(true);
   const token = await AsyncStorage.getItem('userToken');

      // Call Backend API
      const response = await axios.post(
        `${API_URL}/api/v1/vtu/verify-smartcard-no`,
        {
          cableType: selectedProvider.cableType,
          smartCardNo: customerInput  // <--- SEND PIN TO BACKEND FOR VERIFICATION
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      setTimeout(()=>{
        
      setCustomerData(response.data.result.data.validate)
      setIsVerifying(false);
      setCustomerName(response.data.result.data.validate.customerName);

      }, 3000)
     

} catch (error) {
  setIsVerifying(false);
  console.error('verification error, try again', error)
}
    
};

  const handlePay = async() => {
    if (!customerName && selectedProvider?.inputType !== 'phone') {
        Alert.alert('Action Required', 'Please verify the smartcard number first.');
        return;
    }
    try {
      setIsVerifying(true);
   const token = await AsyncStorage.getItem('userToken');

      // Call Backend API
      const response = await axios.post(
        `${API_URL}/api/v1/vtu/buy-cable`,
        {
            cableType: selectedProvider.cableType,
            planId: selectedProvider.planId,
            paymentTypes: "FULL_PAYMENT",
            customerName: customerName,
            smartCardNo: customerData.smartCardNo,
            amount: selectedPlan.ourPrice
            
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': TENANT_ID,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if(response.code===200){
        setPaymentSuccessful(true)
      }

      setTimeout(()=>{
        
     
      setIsVerifying(false);
   
      }, 3000)
     
    } catch (error) {
      
    }
    Alert.alert('Confirm Purchase', `Pay ₦${selectedPlan.price} for ${selectedPlan.name}?`);
  };

  return (
    <View style={styles.container}>
      {console.log('cable providers details: ', cableProviders)}
      {console.log('selected provider: ', selectedProvider)}
        {console.log('selected plan: ', fetchedPlan)}
        {console.log('smart card verification response', customerData)}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* SECTION 1: Providers Grid */}
        <Text style={styles.sectionTitle}>Select Service</Text>
        <View style={styles.providerGrid}>
          {cableProviders?.map((provider) => {
            const isSelected = selectedProvider.cableId === provider.cableId;
            return (
              <TouchableOpacity
                key={provider.cableId}
                style={[
                  styles.providerCard,
                  isSelected && styles.providerCardSelected,
                  isSelected && { borderColor: provider.color }
                ]}
                onPress={() => handleProviderSelect(provider)}
                activeOpacity={0.7}
              >
                {/* Placeholder for Icon - Using first letter if no image */}
                <View style={[styles.iconPlaceholder, { backgroundColor: provider.color }]}>
                   <Text style={styles.iconText}>{provider.cableType[0]}</Text>
                </View>
                <Text style={[styles.providerName, isSelected && styles.providerNameSelected]}>
                  {provider.cableType}
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

        {/* SECTION 2: Verification Input */}
        <View style={styles.inputSection}>
            <Text style={styles.label}>
                {selectedProvider?.inputType === 'phone' ? 'Phone Number' : 'Smartcard / IUC Number'}
            </Text>
            
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder={selectedProvider?.inputType === 'phone' ? "08012345678" : "Enter IUC Number"}
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    value={customerInput}
                    onChangeText={setCustomerInput}
                />
                <TouchableOpacity 
                    style={[styles.verifyBtn, { backgroundColor: selectedProvider?.color }]} 
                    onPress={handleVerify}
                    disabled={isVerifying}
                >
                    {isVerifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.verifyBtnText}>Verify</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Verification Result Banner */}
            {customerName && (
                <View style={styles.verifiedBanner}>
                    <Ionicons name="person-circle" size={20} color="#2ECC71" />
                    <Text style={styles.verifiedText}>{customerName}</Text>
                </View>
            )}
        </View>

        {/* SECTION 3: Plan Selection */}
        <Text style={styles.sectionTitle}>Available Packages</Text>
        <View style={styles.planList}>
          {fetchedPlan?.map((plan) => {
            const isActive = selectedPlan?.planId === plan.planId;
            return (
                <TouchableOpacity 
                    key={plan.planId}
                    style={[styles.planCard, isActive && styles.planCardActive]}
                    onPress={() => setSelectedPlan(plan)}
                >
                    <View>
                        <Text style={[styles.planName, isActive && styles.planTextActive]}>{plan.planId}</Text>
                        <Text style={[styles.planDuration, isActive && styles.planTextActive]}>1 Month</Text>
                    </View>
                    <Text style={[styles.planPrice, isActive && styles.planTextActive]}>₦{plan.ourPrice}</Text>
                </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* SECTION 4: Sticky Footer / Checkout */}
      {selectedPlan && (
        <View style={styles.footer}>
            <View>
                <Text style={styles.totalLabel}>Total to Pay</Text>
                <Text style={styles.totalAmount}>₦{selectedPlan.ourPrice}</Text>
            </View>
            <TouchableOpacity 
                style={[styles.payButton, { backgroundColor: selectedProvider?.color }]}
                onPress={handlePay}
            >
                <Text style={styles.payButtonText}>Pay Now</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            {paymentSuccessful && (<Text style={styles.verifiedText}>PAYMENT SUCCESSFULL</Text>)}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary//'#F7F9FC', // Light grey/blue background
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100, // Space for footer
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textWhite,//'#333',
    marginBottom: 12,
    marginTop: 10,
  },
  
  // --- Provider Grid ---
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  providerCard: {
    width: '24%', // 2 columns
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 5,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    // Shadow for Android
    elevation: 3,
  },
  providerCardSelected: {
    backgroundColor: '#fff', 
    // Border color is set dynamically in the component
  },
  iconPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  providerName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
  },
  providerNameSelected: {
    color: '#000',
    fontWeight: '700',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // --- Input Section ---
  inputSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#F0F2F5',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#333',
  },
  verifyBtn: {
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  verifiedBanner: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8F5',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2ECC71',
  },
  verifiedText: {
    marginLeft: 8,
    color: '#27AE60',
    fontWeight: '600',
    fontSize: 14,
  },

  // --- Plan Cards ---
  planList: {
    gap: 10,
  },
  planCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  planCardActive: {
    backgroundColor: '#222', // Dark theme for selected
    borderColor: '#222',
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  planDuration: {
    fontSize: 12,
    color: '#888',
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2ECC71', // Green for money
  },
  planTextActive: {
    color: '#fff',
  },

  // --- Footer ---
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 20,
  },
  totalLabel: {
    fontSize: 12,
    color: '#888',
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  payButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: 'center',
    gap: 8,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default BuyCableScreen;