import React, { useState, useEffect, useContext } from 'react';
import { UserContext } from '../../context/userContext';
import { useUser } from '../../context/userContext';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  Platform,
  Image
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; // Or react-native-vector-icons
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

const HomeScreen = ({ navigation }) => {
  const [userName, setUserName] = useState('User');
  const [balance, setBalance] = useState('0.00');
  const [refreshing, setRefreshing] = useState(false);
  const {userProfile } = useContext(UserContext);
  const { 
      wallet, 
      fetchDashboardData, 
      isLoading, 
      error,
      isLoggedIn,
      userToken,
      tenantId,
  } = useUser();
  
  // Hardcoded for UI demo - in real app, fetch from API
  const [recentTransactions, setRecentTransactions] = useState([
    { id: 1, type: 'AIRTIME', title: 'MTN Airtime', date: 'Today, 10:23 AM', amount: '- 500.00', status: 'SUCCESS' },
    { id: 2, type: 'FUNDING', title: 'Wallet Funding', date: 'Yesterday, 4:00 PM', amount: '+ 5,000.00', status: 'SUCCESS' },
    { id: 3, type: 'DATA', title: 'Airtel Data 2GB', date: 'Oct 24, 09:30 AM', amount: '- 1,200.00', status: 'FAILED' },
  ]);

  // --- CONFIGURATION ---
  const API_URL = Platform.OS === 'android' ? 'https://vtu-project.vercel.app' : 'https://vtu-project.vercel.app';
  const TENANT_ID = 'clientA'; 

  const fetchWalletData = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
     
      // Fetch User Name
      // const userRes = await axios.get(`${API_URL}/api/v1/auth/me`, { headers: { 'x-tenant-id': TENANT_ID, Authorization: `Bearer ${token}` }});
      // setUserName(userRes.data.data.user.fullName.split(' ')[0]);

      // Fetch Balance
      const walletRes = await axios.get(`${API_URL}/api/v1/user/wallet/balance`, { headers: { 'x-tenant-id': TENANT_ID, Authorization: `Bearer ${token}` }});
      setBalance(walletRes.data.data.balance.toFixed(2));
      


    } catch (error) {
      console.error("Fetch Error", error);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchWalletData().then(() => setRefreshing(false));
  }, []);

// Load data on component mount (or when the user logs in)
  useEffect(() => {
fetchWalletData()
    
  }, []);

  // --- UI COMPONENTS ---

  const QuickActionItem = ({ icon, label, onPress, color }) => (
    <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIconContainer, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const TransactionItem = ({ item }) => {
    const isCredit = item.amount.includes('+');
    const isFailed = item.status === 'FAILED';
    
    return (
      <View style={styles.transactionRow}>
        <View style={[styles.transactionIcon, { backgroundColor: isFailed ? '#FFE5E5' : isCredit ? '#E6FFFA' : '#EBF8FF' }]}>
           <Ionicons 
             name={item.type === 'FUNDING' ? "wallet" : "phone-portrait"} 
             size={20} 
             color={isFailed ? COLORS.error : isCredit ? COLORS.success : COLORS.primary} 
           />
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionTitle}>{item.title}</Text>
          <Text style={styles.transactionDate}>{item.date}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.transactionAmount, { color: isFailed ? COLORS.textSecondary : isCredit ? COLORS.success : COLORS.textPrimary }]}>
             {item.amount}
          </Text>
          <View style={[styles.statusDot, { backgroundColor: isFailed ? COLORS.error : COLORS.success }]} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* 1. Header Section */}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.greetingText}>Good Morning,</Text>
          <Text style={styles.userNameText}>{userProfile.fullName.split(' ')[1]}</Text>
        </View>
        <TouchableOpacity style={styles.notificationBtn}>
          <Ionicons name="notifications-outline" size={24} color={COLORS.textWhite} />
          <View style={styles.redDot} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.surfaceWhite} />}
        showsVerticalScrollIndicator={false}
      >
        
        {/* 2. Wallet Card */}
        <View style={styles.walletWrapper}>
          <View style={styles.walletCard}>
            <View>
              <Text style={styles.walletLabel}>Available Balance</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.currencySymbol}>₦</Text>
                <Text style={styles.balanceText}>{balance}</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.fundButton} 
              onPress={() => navigation.navigate('FundWallet')} // Ensure this screen exists
            >
              <Ionicons name="add-circle" size={18} color={COLORS.primary} style={{ marginRight: 5 }} />
              <Text style={styles.fundButtonText}>Fund Wallet</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. Quick Actions Grid */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Services</Text>
          <View style={styles.gridContainer}>
            <QuickActionItem 
              icon="cellphone-wireless" 
              label="Airtime" 
              color="#007AFF" 
              onPress={() => navigation.navigate('BuyAirtime')} 
            />
            <QuickActionItem 
              icon="wifi" 
              label="Data" 
              color="#00C897" 
              onPress={() => navigation.navigate('BuyData')} 
            />
            <QuickActionItem 
              icon="television-classic" 
              label="Cable TV" 
              color="#FF9500" 
              onPress={() => navigation.navigate('BuyCable')} 
            />
            <QuickActionItem 
              icon="lightbulb-on-outline" 
              label="Electricity" 
              color="#FFCC00" 
              onPress={() => navigation.navigate('BuyElectricity')} 
            />
            {/*  */}
          </View>
        </View>

        {/* 4. Recent Activity */}
        <View style={styles.sectionContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.transactionsList}>
            {recentTransactions.map((item) => (
              <TransactionItem key={item.id} item={item} />
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundMain,
  },
  // Header
  headerContainer: {
    backgroundColor: COLORS.primary,
    padding: SIZES.padding,
    paddingBottom: SIZES.padding * 3, // Extra space for Wallet Card overlap
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    ...FONTS.regular,
    fontSize: SIZES.body2,
    color: 'rgba(255,255,255,0.8)',
  },
  userNameText: {
    ...FONTS.bold,
    fontSize: SIZES.h2,
    color: COLORS.textWhite,
  },
  notificationBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
  },
  redDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  // Wallet Card
  walletWrapper: {
    // paddingHorizontal: SIZES.padding,
    marginTop: -50, // Negative margin to create the overlap effect
  },
  walletCard: {
    backgroundColor: COLORS.primary, // Using Brand Navy
    borderRadius: 20,
    padding: 24,
    ...SHADOWS.medium,
    // Add a subtle gradient visual effect purely via styles
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  walletLabel: {
    ...FONTS.bold,
    // color: 'rgba(255,255,255,0.7)',
    color: COLORS.textWhite,
    marginBottom: 5,
  },
  currencySymbol: {
    ...FONTS.bold,
    fontSize: 20,
    color: COLORS.textWhite,
    marginRight: 4,
  },
  balanceText: {
    ...FONTS.bold,
    fontSize: 32,
    color: COLORS.textWhite,
  },
  fundButton: {
    marginTop: 20,
    backgroundColor: COLORS.accent, // Teal
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fundButtonText: {
    ...FONTS.bold,
    color: COLORS.primary, // Dark text on Teal button for contrast
  },
  // Sections
  sectionContainer: {
    paddingHorizontal: SIZES.padding,
    marginTop: 25,
  },
  sectionTitle: {
    ...FONTS.bold,
    fontSize: SIZES.h3,
    color: COLORS.textPrimary,
  },
  // Grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  actionItem: {
    width: '47%', // 2 items per row
    backgroundColor: COLORS.surfaceWhite,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    flexDirection: 'row', // Icon left, text right style
    ...SHADOWS.light,
  },
  actionIconContainer: {
    width: 45,
    height: 45,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionLabel: {
    ...FONTS.semiBold,
    fontSize: SIZES.body1,
    color: COLORS.textPrimary,
  },
  // Transactions
  seeAllText: {
    ...FONTS.medium,
    color: COLORS.textSecondary,
  },
  transactionsList: {
    backgroundColor: COLORS.surfaceWhite,
    borderRadius: 16,
    padding: 10,
    ...SHADOWS.light,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    ...FONTS.semiBold,
    fontSize: SIZES.body1,
    color: COLORS.textPrimary,
  },
  transactionDate: {
    ...FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  transactionAmount: {
    ...FONTS.bold,
    fontSize: SIZES.body1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  }
});

export default HomeScreen;