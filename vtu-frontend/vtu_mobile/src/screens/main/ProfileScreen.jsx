import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import { logout } from '../../redux/slices/authSlice';
import { fetchBalanceSuccess } from '../../redux/slices/walletSlice';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ProfileScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const walletBalance = useSelector((state) => state.wallet.balance);

  const [user,        setUser]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch profile + wallet in one call
  // ---------------------------------------------------------------------------
  const fetchProfile = useCallback(async () => {
    try {
      // FIX: was reading from AsyncStorage 'userData' — now hits backend
      const response = await apiClient.get(API_ROUTES.USER.DASHBOARD);

      if (response.data?.status === 'success') {
        const { user: userData, wallet } = response.data.data;
        setUser(userData);

        if (wallet?.balanceKobo !== undefined) {
          dispatch(fetchBalanceSuccess({
            balance:  wallet.balanceKobo,
            currency: wallet.currency || 'NGN',
          }));
        }
      }
    } catch (error) {
      console.error('[Profile] fetchProfile error:', error.response?.data || error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dispatch]);

  // Refetch every time the screen comes into focus (e.g. after EditProfile)
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to exit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // FIX: clear the correct AsyncStorage keys used by apiClient interceptor
          await AsyncStorage.multiRemove(['token', 'tenantId', 'pendingTransactionRef']);
          dispatch(logout());
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  // ---------------------------------------------------------------------------
  // Menu item component
  // ---------------------------------------------------------------------------
  const MenuItem = ({ icon, label, subLabel, onPress, color = COLORS.textPrimary, showArrow = true, rightContent }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} disabled={!onPress}>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subLabel && <Text style={styles.menuSubLabel}>{subLabel}</Text>}
      </View>
      {rightContent ? rightContent : (showArrow && <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />)}
    </TouchableOpacity>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const initial = user?.fullName?.trim()?.charAt(0)?.toUpperCase() || 'U';
  const pinStatusColor = user?.isPinSet ? '#27AE60' : '#E53E3E';
  const pinStatusLabel = user?.isPinSet ? 'PIN Set' : 'PIN Not Set';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.headerBackground}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            <Ionicons name="pencil-sharp" size={20} color={COLORS.textWhite} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.userName}>{user?.fullName || 'User Account'}</Text>
            <Text style={styles.userEmail}>{user?.email || ''}</Text>
            <Text style={styles.userPhone}>{user?.phone || ''}</Text>
          </View>
        </View>

        {/* Wallet balance summary */}
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <Text style={styles.balanceValue}>
              ₦{(walletBalance / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <TouchableOpacity style={styles.fundBtn} onPress={() => navigation.navigate('FundWallet')}>
            <Ionicons name="add" size={16} color={COLORS.primary} />
            <Text style={styles.fundBtnText}>Fund</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Account Settings */}
        <Text style={styles.sectionTitle}>Account Settings</Text>
        <View style={styles.card}>
          <MenuItem
            icon="receipt-outline"
            label="Transaction History"
            subLabel="View all your transactions"
            onPress={() => navigation.navigate('Transactions')}
          />
          <MenuItem
            icon="person-outline"
            label="Personal Information"
            subLabel="Update your name and phone"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon="swap-horizontal-outline"
            label="Fund Wallet"
            subLabel="Card, bank or transfer"
            color={COLORS.success || '#27AE60'}
            onPress={() => navigation.navigate('FundWallet')}
          />
        </View>

        {/* Security */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <MenuItem
            icon="lock-closed-outline"
            label="Transaction PIN"
            subLabel={pinStatusLabel}
            color={COLORS.accent || '#F5A623'}
            onPress={() => navigation.navigate(user?.isPinSet ? 'UpdatePin' : 'SetPin')}
            rightContent={
              <View style={[styles.statusDot, { backgroundColor: pinStatusColor }]} />
            }
          />
          <MenuItem
            icon="key-outline"
            label="Change Password"
            subLabel="Update your login password"
            onPress={() => navigation.navigate('UpdatePassword')}
          />
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          <MenuItem icon="help-circle-outline" label="FAQ & Help Center" onPress={() => {}} />
          <MenuItem icon="chatbubble-ellipses-outline" label="Contact Us" onPress={() => {}} />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.error || '#FF4D4D'} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Version 1.0.2</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundMain },
  headerBackground: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SIZES.padding,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  headerTitle: { ...FONTS.bold, fontSize: SIZES.h3, color: COLORS.textWhite },
  profileInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.surfaceWhite,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  avatarText: { fontSize: 28, color: COLORS.primary, fontWeight: 'bold' },
  nameContainer: { marginLeft: 15, flex: 1 },
  userName: { ...FONTS.bold, fontSize: SIZES.h4, color: COLORS.textWhite },
  userEmail: { ...FONTS.regular, fontSize: 13, color: '#D1D5DB', marginTop: 2 },
  userPhone: { ...FONTS.regular, fontSize: 13, color: '#D1D5DB', marginTop: 1 },

  // Balance card
  balanceCard: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: { ...FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  balanceValue: { ...FONTS.bold, fontSize: 22, color: COLORS.textWhite, marginTop: 4 },
  fundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  fundBtnText: { ...FONTS.bold, fontSize: 13, color: COLORS.primary },

  content: { padding: SIZES.padding },
  sectionTitle: { ...FONTS.bold, fontSize: 14, color: COLORS.textSecondary, marginBottom: 10, marginTop: 15, textTransform: 'uppercase' },
  card: {
    backgroundColor: COLORS.surfaceWhite,
    borderRadius: SIZES.radius,
    paddingVertical: 5,
    marginBottom: 10,
    ...SHADOWS.light,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuTextContainer: { flex: 1 },
  menuLabel: { ...FONTS.medium, fontSize: 15, color: COLORS.textPrimary },
  menuSubLabel: { ...FONTS.regular, fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    padding: 15,
    backgroundColor: '#FFF0F0',
    borderRadius: SIZES.radius,
  },
  logoutText: { marginLeft: 10, color: '#FF4D4D', fontWeight: 'bold' },
  versionText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 20, marginBottom: 30, fontSize: 12 },
});

export default ProfileScreen;