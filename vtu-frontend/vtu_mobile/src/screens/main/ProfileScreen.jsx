import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Switch
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

const ProfileScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      // In a real app, fetch from API. For now, we simulate from Storage/State
      const userData = await AsyncStorage.getItem('userData');
      if (userData) setUser(JSON.parse(userData));
    } catch (error) {
      console.error("Error fetching profile", error);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to exit?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Logout", 
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.replace('Login');
        },
        style: "destructive" 
      }
    ]);
  };

  const MenuItem = ({ icon, label, subLabel, onPress, color = COLORS.textPrimary, showArrow = true }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.iconContainer, { backgroundColor: color + '10' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subLabel && <Text style={styles.menuSubLabel}>{subLabel}</Text>}
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Blue Header Section */}
      <View style={styles.headerBackground}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            <Ionicons name="pencil-sharp" size={20} color={COLORS.textWhite} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.substring(0, 1) || 'U'}</Text>
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.userName}>{user?.name || 'User Account'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'user@example.com'}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Verified User</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Section: Account Settings */}
        <Text style={styles.sectionTitle}>Account Settings</Text>
        <View style={styles.card}>
          <MenuItem 
            icon="wallet-outline" 
            label="Wallet History" 
            subLabel="View all funding activities" 
            onPress={() => navigation.navigate('Transactions')}
          />
          <MenuItem 
            icon="person-outline" 
            label="Personal Information" 
            onPress={() => navigation.navigate('EditProfile')}
          />
        </View>

        {/* Section: Security */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <MenuItem 
            icon="lock-closed-outline" 
            label="Change Transaction PIN" 
            subLabel="Secure your transfers"
            color={COLORS.accent}
            onPress={() => navigation.navigate('UpdatePin')}
          />
          <View style={styles.menuItem}>
            <View style={[styles.iconContainer, { backgroundColor: COLORS.primary + '10' }]}>
              <Ionicons name="finger-print" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuLabel}>Biometric Login</Text>
            </View>
            <Switch 
                value={isBiometricEnabled} 
                onValueChange={setIsBiometricEnabled}
                trackColor={{ false: "#767577", true: COLORS.primary }}
            />
          </View>
        </View>

        {/* Section: Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          <MenuItem icon="help-circle-outline" label="FAQ & Help Center" onPress={() => {}} />
          <MenuItem icon="chatbubble-ellipses-outline" label="Contact Us" onPress={() => {}} />
        </View>

        {/* Logout Button */}
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
    paddingBottom: 30,
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
  nameContainer: { marginLeft: 15 },
  userName: { ...FONTS.bold, fontSize: SIZES.h4, color: COLORS.textWhite },
  userEmail: { ...FONTS.regular, fontSize: 14, color: '#D1D5DB', marginBottom: 5 },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 10, color: COLORS.textWhite, fontWeight: 'bold' },
  content: { padding: SIZES.padding },
  sectionTitle: { ...FONTS.bold, fontSize: 16, color: COLORS.gray, marginBottom: 10, marginTop: 15 },
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
  menuSubLabel: { ...FONTS.regular, fontSize: 12, color: COLORS.gray },
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
  versionText: { textAlign: 'center', color: COLORS.gray, marginTop: 20, fontSize: 12 },
});

export default ProfileScreen;