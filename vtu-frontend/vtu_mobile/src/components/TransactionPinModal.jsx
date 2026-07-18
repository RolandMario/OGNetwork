import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

const TransactionPinModal = ({
  isVisible,
  onClose,
  onSubmit,
  isLoading,
  error,
}) => {
  const [pin, setPin] = useState(['', '', '', '']);
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  const handleChange = (text, index) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);

    if (digit && index < 3) {
      // Move focus to next box
      inputRefs[index + 1].current?.focus();
    }

    // Auto-submit when last digit is filled
    if (digit && index === 3) {
      const fullPin = [...newPin].join('');
      if (fullPin.length === 4) {
        onSubmit(fullPin);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !pin[index] && index > 0) {
      // Move focus back on backspace if current box is empty
      inputRefs[index - 1].current?.focus();
      const newPin = [...pin];
      newPin[index - 1] = '';
      setPin(newPin);
    }
  };

  const handleSubmit = () => {
    const fullPin = pin.join('');
    if (fullPin.length === 4) onSubmit(fullPin);
  };

  const resetAndClose = () => {
    setPin(['', '', '', '']);
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isVisible}
      onRequestClose={resetAndClose}
      statusBarTranslucent
      onShow={() => {
        setPin(['', '', '', '']);
        setTimeout(() => inputRefs[0].current?.focus(), 400);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Enter Transaction PIN</Text>
          <Text style={styles.subtitle}>
            Please enter your 4-digit PIN to confirm this transaction.
          </Text>

          <View style={styles.pinContainer}>
            {[0, 1, 2, 3].map((index) => (
              <TextInput
                key={index}
                ref={inputRefs[index]}
                style={[
                  styles.pinBox,
                  pin[index] ? styles.pinBoxFilled : null,
                ]}
                keyboardType="numeric"
                maxLength={1}
                value={pin[index] ? '•' : ''}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                secureTextEntry={false}
                caretHidden={true}
                contextMenuHidden={true}
                selectTextOnFocus={true}
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              onPress={resetAndClose}
              style={styles.cancelButton}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              style={[
                styles.confirmButton,
                (pin.join('').length < 4 || isLoading) && styles.disabledButton,
              ]}
              disabled={pin.join('').length < 4 || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '85%',
    marginBottom: 24,
  },
pinBox: {
    width: 58,
    height: 58,
    borderWidth: 2,
    borderColor: '#9ca3af',        // was #d1d5db — much more visible
    borderRadius: 14,
    textAlign: 'center',
    fontSize: 28,
    color: '#1f2937',
    backgroundColor: '#f3f4f6',   // was #f9fafb — slightly more contrast
},
pinBoxFilled: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
},
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 16,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#93c5fd',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default TransactionPinModal;