import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SIZES, FONTS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';

const UpdatePasswordScreen = ({ navigation }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async () => {
    // Validate inputs
    if (!currentPassword) {
      Alert.alert('Validation Error', 'Please enter your current password.');
      return;
    }
    if (!newPassword) {
      Alert.alert('Validation Error', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'New passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.patch(
        API_ROUTES.USER.UPDATE_PASSWORD,
        {
          currentPassword,
          newPassword,
        }
      );

      if (response.data?.status === 'success') {
        // Update the stored token since it was refreshed
        if (response.data?.token) {
          await AsyncStorage.setItem('token', response.data.token);
        }

        Alert.alert(
          '✅ Success',
          'Your password has been updated successfully.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error('[UpdatePassword] Error:', error.response?.data || error.message);

      const status = error.response?.status;
      const msg = error.response?.data?.message || 'Failed to update password. Please try again.';

      if (status === 401) {
        Alert.alert('Incorrect Password', 'Your current password is incorrect.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Change Password</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* Current Password */}
            <CustomInput
              label="Current Password"
              placeholder="Enter current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              icon={<Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />}
            />

            {/* New Password */}
            <CustomInput
              label="New Password"
              placeholder="Enter new password (min 6 chars)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              icon={<Ionicons name="lock-open-outline" size={20} color={COLORS.textSecondary} />}
            />

            {/* Confirm New Password */}
            <CustomInput
              label="Confirm New Password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              icon={<Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textSecondary} />}
            />
          </View>

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Password Requirements:</Text>
            <Text style={styles.tipItem}>• At least 6 characters long</Text>
            <Text style={styles.tipItem}>• Should be different from your current password</Text>
          </View>

          {/* Submit Button */}
          <View style={{ marginTop: 30 }}>
            <CustomButton
              label={loading ? 'Updating...' : 'Update Password'}
              onPress={handleUpdatePassword}
              isLoading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundMain },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: COLORS.surfaceWhite,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { ...FONTS.bold, fontSize: 18, color: COLORS.textPrimary },
  content: { padding: 20, paddingBottom: 50 },
  card: {
    backgroundColor: COLORS.surfaceWhite,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  tipsContainer: {
    backgroundColor: '#EBF8FF',
    borderRadius: 12,
    padding: 16,
  },
  tipsTitle: { ...FONTS.bold, fontSize: 14, color: COLORS.textPrimary, marginBottom: 8 },
  tipItem: { ...FONTS.regular, fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
});

export default UpdatePasswordScreen;