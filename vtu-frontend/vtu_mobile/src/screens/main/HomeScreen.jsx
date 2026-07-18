import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserContext } from '../../context/userContext';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import {
  fetchBalanceStart,
  fetchBalanceSuccess,
  fetchBalanceFail,
} from '../../redux/slices/walletSlice';

const HomeScreen = ({ navigation }) => {
  const dispatch    = useDispatch();
  const { userProfile } = useContext(UserContext);

  // Pull balance from Redux — single source of truth
  const { balance, currency, isLoading, lastUpdated } = useSelector((state) => state.wallet);

  const [refreshing, setRefreshing]           = useState(false);
  const [recentTransactions, setRecentTransactions] = useState([]);

  const appState = useRef(AppState.currentState);

  // ---------------------------------------------------------------------------
  // Core fetch — updates Redux, which re-renders the balance display
  // ---------------------------------------------------------------------------
 const fetchWalletData = useCallback(async () => {
  try {
    dispatch(fetchBalanceStart());

    const response = await apiClient.get(API_ROUTES.WALLET.GET_BALANCE);

    if (response.data.status === 'success') {
      const { balanceNaira, currency: cur, transactions } = response.data.data;

      dispatch(fetchBalanceSuccess({
        balance:  balanceNaira,
        currency: cur || 'NGN',
      }));

      if (transactions?.length) {
        setRecentTransactions(transactions.slice(0, 5));
      }
    }
  } catch (error) {
    const msg = error.response?.data?.message || 'Failed to fetch wallet data.';
    dispatch(fetchBalanceFail(msg));
    console.error('[HomeScreen] fetchWalletData error:', msg);
  }
}, [dispatch]);

  // ---------------------------------------------------------------------------
  // 1. Fetch on screen focus — fires every time user navigates back to HomeScreen
  //    This is the key trigger after FundWallet completes.
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      fetchWalletData();
    }, [fetchWalletData])
  );

  // ---------------------------------------------------------------------------
  // 2. Fetch when app comes back to foreground (e.g. user returns from Paystack
  //    browser redirect)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        console.log('[HomeScreen] App foregrounded — refreshing wallet.');
        fetchWalletData();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [fetchWalletData]);

  // ---------------------------------------------------------------------------
  // 3. Pull-to-refresh
  // ---------------------------------------------------------------------------
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchWalletData();
    setRefreshing(false);
  }, [fetchWalletData]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatBalance = (val) => {
    if (val === null || val === undefined) return '0.00';
    return Number(val).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // ---------------------------------------------------------------------------
  // Sub-components
  // ---------------------------------------------------------------------------
  const QuickActionItem = ({ icon, label, onPress, color }) => (
    <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIconContainer, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const TransactionItem = ({ item }) => {
    const isCredit = item.type === 'FUNDING';
    const isFailed = item.status === 'FAILED';
    const amountNaira = (item.amount / 100).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
    });

    return (
      <View style={styles.transactionRow}>
        <View style={[
          styles.transactionIcon,
          { backgroundColor: isFailed ? '#FFE5E5' : isCredit ? '#E6FFFA' : '#EBF8FF' },
        ]}>
          <Ionicons
            name={isCredit ? 'wallet' : 'phone-portrait'}
            size={20}
            color={isFailed ? COLORS.error : isCredit ? COLORS.success : COLORS.primary}
          />
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionTitle}>{item.type}</Text>
          <Text style={styles.transactionDate}>
            {new Date(item.createdAt).toLocaleDateString('en-NG', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[
            styles.transactionAmount,
            { color: isFailed ? COLORS.textSecondary : isCredit ? COLORS.success : COLORS.textPrimary },
          ]}>
            {isCredit ? '+' : '-'} ₦{amountNaira}
          </Text>
          <View style={[
            styles.statusDot,
            { backgroundColor: isFailed ? COLORS.error : COLORS.success },
          ]} />
        </View>
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.greetingText}>Good Morning,</Text>
          <Text style={styles.userNameText}>
            {userProfile?.fullName?.split(' ')[0] ?? 'User'}
          </Text>
        </View>
        <TouchableOpacity style={styles.notificationBtn}>
          <Ionicons name="notifications-outline" size={24} color={COLORS.textWhite} />
          <View style={styles.redDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.surfaceWhite}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Wallet Card */}
        <View style={styles.walletWrapper}>
          <View style={styles.walletCard}>
            <View>
              <Text style={styles.walletLabel}>Available Balance</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.currencySymbol}>₦</Text>
                <Text style={styles.balanceText}>{formatBalance(balance)}</Text>
              </View>
              {lastUpdated && (
                <Text style={styles.lastUpdatedText}>
                  Updated {new Date(lastUpdated).toLocaleTimeString('en-NG', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.fundButton}
              onPress={() => navigation.navigate('FundWallet')}
            >
              <Ionicons name="add-circle" size={18} color={COLORS.primary} style={{ marginRight: 5 }} />
              <Text style={styles.fundButtonText}>Fund Wallet</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Services</Text>
          <View style={styles.gridContainer}>
            <QuickActionItem icon="cellphone-wireless" label="Airtime"     color="#007AFF" onPress={() => navigation.navigate('BuyAirtime')} />
            <QuickActionItem icon="wifi"               label="Data"        color="#00C897" onPress={() => navigation.navigate('BuyData')} />
            <QuickActionItem icon="television-classic" label="Cable TV"    color="#FF9500" onPress={() => navigation.navigate('BuyCable')} />
            <QuickActionItem icon="lightbulb-on-outline" label="Electricity" color="#FFCC00" onPress={() => navigation.navigate('BuyElectricity')} />
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.sectionContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.transactionsList}>
            {recentTransactions.length > 0 ? (
              recentTransactions.map((item) => (
                <TransactionItem key={item._id} item={item} />
              ))
            ) : (
              <Text style={styles.emptyText}>No transactions yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.backgroundMain },
  headerContainer:  { backgroundColor: COLORS.primary, padding: SIZES.padding, paddingBottom: SIZES.padding * 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingText:     { ...FONTS.regular, fontSize: SIZES.body2, color: 'rgba(255,255,255,0.8)' },
  userNameText:     { ...FONTS.bold, fontSize: SIZES.h2, color: COLORS.textWhite },
  notificationBtn:  { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 50 },
  redDot:           { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
  walletWrapper:    { marginTop: -20 },
  walletCard:       { backgroundColor: COLORS.primary, borderRadius: 20, padding: 24, ...SHADOWS.medium, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  walletLabel:      { ...FONTS.bold, color: COLORS.textWhite, marginBottom: 5 },
  currencySymbol:   { ...FONTS.bold, fontSize: 20, color: COLORS.textWhite, marginRight: 4 },
  balanceText:      { ...FONTS.bold, fontSize: 32, color: COLORS.textWhite },
  lastUpdatedText:  { ...FONTS.regular, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  fundButton:       { marginTop: 20, backgroundColor: COLORS.accent, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  fundButtonText:   { ...FONTS.bold, color: COLORS.primary },
  sectionContainer: { paddingHorizontal: SIZES.padding, marginTop: 25 },
  sectionTitle:     { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textPrimary },
  gridContainer:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 15 },
  actionItem:       { width: '47%', backgroundColor: COLORS.surfaceWhite, padding: 16, borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', ...SHADOWS.light },
  actionIconContainer: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  actionLabel:      { ...FONTS.semiBold, fontSize: SIZES.body1, color: COLORS.textPrimary },
  seeAllText:       { ...FONTS.medium, color: COLORS.textSecondary },
  transactionsList: { backgroundColor: COLORS.surfaceWhite, borderRadius: 16, padding: 10, ...SHADOWS.light },
  transactionRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  transactionIcon:  { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  transactionDetails: { flex: 1 },
  transactionTitle: { ...FONTS.semiBold, fontSize: SIZES.body1, color: COLORS.textPrimary },
  transactionDate:  { ...FONTS.regular, fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  transactionAmount: { ...FONTS.bold, fontSize: SIZES.body1 },
  statusDot:        { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  emptyText:        { ...FONTS.regular, color: COLORS.textSecondary, textAlign: 'center', padding: 20 },
});

export default HomeScreen;