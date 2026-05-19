import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

const SetupPinScreen = ({ navigation }) => {
  const [step, setStep] = useState(1); // 1: Enter PIN, 2: Confirm PIN
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const PIN_LENGTH = 4;

  const handleKeyPress = (val) => {
    let activePin = step === 1 ? pin : confirmPin;
    let setter = step === 1 ? setPin : setConfirmPin;

    if (val === 'back') {
      setter(activePin.slice(0, -1));
    } else if (activePin.length < PIN_LENGTH) {
      const updated = activePin + val;
      setter(updated);

      // Auto-advance logic
      if (updated.length === PIN_LENGTH && step === 1) {
        setTimeout(() => setStep(2), 300);
      }
    }
  };

  const handleFinish = async () => {
    if (pin !== confirmPin) {
      Vibration.vibrate();
      Alert.alert("Error", "PINs do not match. Try again.");
      setStep(1);
      setPin('');
      setConfirmPin('');
      return;
    }

    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.post(
        'https://vtu-project.vercel.app/api/v1/user/set-transaction-pin',
        { pin: pin },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': 'clientA' 
          }
        }
      );

      if (response.data.success) {
        // Update local state to reflect PIN is now set
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          const parsed = JSON.parse(userData);
          await AsyncStorage.setItem('userData', JSON.stringify({ ...parsed, isPinSet: true }));
        }

        Alert.alert("Success", "Transaction PIN set successfully!", [
          { text: "Excellent", onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error) {
      Alert.alert("Failed", error.response?.data?.message || "Could not set PIN");
    } finally {
      setIsLoading(false);
    }
  };

  const renderDots = () => {
    let currentDisplay = step === 1 ? pin : confirmPin;
    return (
      <View style={styles.dotsContainer}>
        {[1, 2, 3, 4].map((_, i) => (
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
    >
      {icon ? <Ionicons name={icon} size={28} color={COLORS.textPrimary} /> : 
             <Text style={styles.keyText}>{value}</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create PIN</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.illustration}>
          <Ionicons name="lock-open-outline" size={50} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>{step === 1 ? "Set Transaction PIN" : "Confirm Your PIN"}</Text>
        <Text style={styles.subtitle}>
          {step === 1 
            ? "Create a 4-digit PIN to secure your transactions and withdrawals." 
            : "Please re-enter your PIN to ensure it's correct."}
        </Text>

        {renderDots()}

        {step === 2 && confirmPin.length === PIN_LENGTH && (
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={handleFinish}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#FFF" /> : 
            <Text style={styles.actionBtnText}>Finish Setup</Text>}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.keypad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'back'].map((key, index) => (
          <View key={index} style={styles.keyWrapper}>
            {key === '' ? <View style={styles.key} /> : 
             <KeypadButton value={key} icon={key === 'back' ? "backspace-outline" : null} />}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { ...FONTS.bold, fontSize: 18 },
  content: { alignItems: 'center', flex: 1, paddingTop: 30 },
  illustration: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  title: { ...FONTS.bold, fontSize: 22, color: COLORS.textPrimary },
  subtitle: { 
    ...FONTS.regular, 
    fontSize: 14, 
    color: COLORS.gray, 
    textAlign: 'center', 
    paddingHorizontal: 50,
    marginTop: 10,
    lineHeight: 20
  },
  dotsContainer: { flexDirection: 'row', marginTop: 40, gap: 20 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: COLORS.border },
  dotFilled: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  actionBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    paddingHorizontal: 50,
    borderRadius: 30,
    marginTop: 50,
    ...SHADOWS.medium
  },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  keypad: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    backgroundColor: '#F9F9F9', 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30,
    paddingVertical: 20
  },
  keyWrapper: { width: '33.33%', alignItems: 'center', marginVertical: 10 },
  key: { width: 70, height: 60, justifyContent: 'center', alignItems: 'center' },
  keyText: { fontSize: 28, fontWeight: '600', color: COLORS.textPrimary }
});

export default SetupPinScreen;