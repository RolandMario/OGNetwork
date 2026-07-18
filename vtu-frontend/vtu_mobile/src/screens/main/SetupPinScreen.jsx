import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';

const PIN_LENGTH = 4;

const SetupPinScreen = ({ navigation }) => {
  const dispatch = useDispatch();

  const [step,       setStep]       = useState(1); // 1: Enter, 2: Confirm
  const [pin,        setPin]        = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading,  setIsLoading]  = useState(false);

  // ---------------------------------------------------------------------------
  // Keypad handler
  // ---------------------------------------------------------------------------
  const handleKeyPress = (val) => {
    const activePin = step === 1 ? pin : confirmPin;
    const setter    = step === 1 ? setPin : setConfirmPin;

    if (val === 'back') {
      setter(activePin.slice(0, -1));
      return;
    }

    if (activePin.length >= PIN_LENGTH) return;

    const updated = activePin + String(val);
    setter(updated);

    // Auto-advance to confirm step
    if (updated.length === PIN_LENGTH && step === 1) {
      setTimeout(() => setStep(2), 300);
    }

    // Auto-submit on confirm step
    if (updated.length === PIN_LENGTH && step === 2) {
      setTimeout(() => handleFinish(pin, updated), 300);
    }
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const handleFinish = async (enteredPin, enteredConfirm) => {
    if (enteredPin !== enteredConfirm) {
      Vibration.vibrate();
      Alert.alert('PIN Mismatch', 'PINs do not match. Please try again.');
      setStep(1);
      setPin('');
      setConfirmPin('');
      return;
    }

    setIsLoading(true);

    try {
      // FIX: use apiClient (handles token + x-tenant-id automatically)
      // FIX: correct endpoint from API_ROUTES
      const response = await apiClient.post(API_ROUTES.USER.SET_PIN, {
        pin: enteredPin,
      });

      // FIX: check response.data.status === 'success'
      if (response.data.status === 'success') {
        Alert.alert(
          '🎉 PIN Set!',
          'Your transaction PIN has been set successfully. You can now make purchases.',
          [
            {
              text: 'Get Started',
              // FIX: navigate to MainNavigator, not goBack()
              onPress: () => navigation.replace('MainNavigator'),
            },
          ]
        );
      }

    } catch (error) {
      console.error('[SetupPin] error:', error.response?.data || error.message);

      const status = error.response?.status;
      const msg    = error.response?.data?.message || 'Could not set PIN. Please try again.';

      if (status === 400 && msg.includes('already set')) {
        // PIN already set — go straight to app
        navigation.replace('MainNavigator');
        return;
      }

      Alert.alert('Failed', msg);
      // Reset so user can try again
      setStep(1);
      setPin('');
      setConfirmPin('');

    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  const renderDots = () => {
    const currentDisplay = step === 1 ? pin : confirmPin;
    return (
      <View style={styles.dotsContainer}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, currentDisplay.length > i && styles.dotFilled]}
          />
        ))}
      </View>
    );
  };

  const KeypadButton = ({ value, icon }) => (
    <TouchableOpacity
      style={styles.key}
      onPress={() => handleKeyPress(value)}
      disabled={isLoading}
      activeOpacity={0.6}
    >
      {icon
        ? <Ionicons name={icon} size={28} color={COLORS.textPrimary} />
        : <Text style={styles.keyText}>{value}</Text>
      }
    </TouchableOpacity>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create PIN</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.illustration}>
          <Ionicons
            name={step === 1 ? 'lock-open-outline' : 'lock-closed-outline'}
            size={50}
            color={COLORS.primary}
          />
        </View>

        <Text style={styles.title}>
          {step === 1 ? 'Set Transaction PIN' : 'Confirm Your PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 1
            ? 'Create a 4-digit PIN to secure your transactions.'
            : 'Re-enter your PIN to confirm it is correct.'}
        </Text>

        {renderDots()}

        {/* Step indicator */}
        <Text style={styles.stepText}>Step {step} of 2</Text>

        {/* Loading indicator while submitting */}
        {isLoading && (
          <ActivityIndicator
            color={COLORS.primary}
            size="large"
            style={{ marginTop: 30 }}
          />
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'back'].map((key, index) => (
          <View key={index} style={styles.keyWrapper}>
            {key === '' ? (
              <View style={styles.key} />
            ) : (
              <KeypadButton
                value={key}
                icon={key === 'back' ? 'backspace-outline' : null}
              />
            )}
          </View>
        ))}
      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#FFF' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle:  { ...FONTS.bold, fontSize: 18 },
  content:      { alignItems: 'center', flex: 1, paddingTop: 30 },
  illustration: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primary + '10', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  title:        { ...FONTS.bold, fontSize: 22, color: COLORS.textPrimary },
  subtitle:     { ...FONTS.regular, fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 50, marginTop: 10, lineHeight: 20 },
  dotsContainer:{ flexDirection: 'row', marginTop: 40, gap: 20 },
  dot:          { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: COLORS.border },
  dotFilled:    { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepText:     { ...FONTS.regular, fontSize: 12, color: COLORS.textSecondary, marginTop: 16 },
  keypad:       { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F9F9F9', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingVertical: 20 },
  keyWrapper:   { width: '33.33%', alignItems: 'center', marginVertical: 10 },
  key:          { width: 70, height: 60, justifyContent: 'center', alignItems: 'center' },
  keyText:      { fontSize: 28, fontWeight: '600', color: COLORS.textPrimary },
});

export default SetupPinScreen;