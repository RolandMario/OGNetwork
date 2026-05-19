import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import CustomButton from '../../components/CustomButton';

const UpdatePinScreen = ({ navigation }) => {
  const [step, setStep] = useState(1); // 1: Old PIN, 2: New PIN, 3: Confirm
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

const handleComplete = async () => {
    // 1. Client-side match check
    if (newPin !== confirmPin) {
      Vibration.vibrate();
      Alert.alert("Error", "New PIN and Confirmation do not match.");
      // Reset to step 2 to let them try setting the new PIN again
      setStep(2);
      setNewPin('');
      setConfirmPin('');
      return;
    }

    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      // 2. Call the backend
      const response = await axios.patch(
        'https://vtu-project.vercel.app/api/v1/user/update-transaction-pin',
        { 
          oldPin: currentPin, 
          newPin: newPin 
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': 'clientA' // Adjust based on your tenant logic
          }
        }
      );

      if (response.data.success) {
        Alert.alert(
          "Success", 
          "Your transaction PIN has been updated successfully.", 
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error("PIN Update Error:", error);
      
      const errorMessage = error.response?.data?.message || "Failed to update PIN. Please try again.";
      
      Alert.alert("Update Failed", errorMessage);
      
      // If the old PIN was wrong, reset to the beginning
      if (errorMessage.toLowerCase().includes("current") || errorMessage.toLowerCase().includes("old")) {
        handleReset();
      } else {
        // Otherwise just clear the new PIN attempts
        setStep(2);
        setNewPin('');
        setConfirmPin('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderPinIndicator = (value) => (
    <View style={styles.pinRow}>
      {[1, 2, 3, 4].map((_, i) => (
        <View key={i} style={[styles.dot, value.length > i && styles.activeDot]} />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security PIN</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>
          {step === 1 ? "Enter Old PIN" : step === 2 ? "Set New PIN" : "Confirm New PIN"}
        </Text>
        <Text style={styles.subtitle}>
          This PIN is required for all transactions
        </Text>

        {renderPinIndicator(step === 1 ? oldPin : step === 2 ? newPin : confirmPin)}

        {/* Numeric Keypad Simulation */}
        <View style={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map((key) => (
            <TouchableOpacity 
              key={key} 
              style={styles.key}
              onPress={() => {
                const current = step === 1 ? oldPin : step === 2 ? newPin : confirmPin;
                if (key === 'C') {
                   step === 1 ? setOldPin(current.slice(0, -1)) : step === 2 ? setNewPin(current.slice(0, -1)) : setConfirmPin(current.slice(0, -1));
                } else if (key === '✓') {
                    if (current.length === 4) {
                        if (step < 3) setStep(step + 1);
                        else handleComplete();
                    }
                } else if (current.length < 4) {
                   step === 1 ? setOldPin(oldPin + key) : step === 2 ? setNewPin(newPin + key) : setConfirmPin(confirmPin + key);
                }
              }}
            >
              <Text style={styles.keyText}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {loading && <ActivityIndicator style={styles.loader} size="large" color={COLORS.primary} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20 },
  headerTitle: { ...FONTS.bold, fontSize: 18 },
  content: { alignItems: 'center', marginTop: 40 },
  title: { ...FONTS.bold, fontSize: 22, color: COLORS.textPrimary },
  subtitle: { color: COLORS.gray, marginTop: 10, marginBottom: 40 },
  pinRow: { flexDirection: 'row', gap: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.border },
  activeDot: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: '80%', marginTop: 60, justifyContent: 'center' },
  key: { width: '33%', height: 80, justifyContent: 'center', alignItems: 'center' },
  keyText: { fontSize: 24, fontWeight: '600' },
  loader: { position: 'absolute', top: '50%', left: '50%' }
});

export default UpdatePinScreen;