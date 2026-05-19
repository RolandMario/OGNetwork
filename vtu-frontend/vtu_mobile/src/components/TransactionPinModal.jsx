import React, { useState, useEffect } from 'react';
import { 
    Modal, 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    StyleSheet, 
    ActivityIndicator,
    Keyboard,
    TouchableWithoutFeedback
} from 'react-native';

const TransactionPinModal = ({ isVisible, onClose, onSubmit, isLoading, error }) => {
    const [pin, setPin] = useState('');

    // Reset pin when modal opens/closes
    useEffect(() => {
        if (!isVisible) {
            setPin('');
        }
    }, [isVisible]);

    const handlePress = () => {
        if (pin.length === 4) {
            onSubmit(pin);
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={isVisible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.title}>Enter Transaction PIN</Text>
                        <Text style={styles.subtitle}>Please enter your 4-digit PIN to confirm this transaction.</Text>

                        {/* PIN Display Boxes */}
                        <View style={styles.pinContainer}>
                            {[0, 1, 2, 3].map((index) => (
                                <View key={index} style={[styles.pinBox, pin.length > index && styles.pinBoxFilled]}>
                                    <Text style={styles.pinText}>
                                        {pin.length > index ? '•' : ''}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* Hidden Input for Keyboard Handling */}
                        <TextInput
                            style={styles.hiddenInput}
                            keyboardType="numeric"
                            maxLength={4}
                            value={pin}
                            onChangeText={setPin}
                            autoFocus={isVisible}
                            secureTextEntry={true}
                        />

                        {/* Error Message */}
                        {error ? <Text style={styles.errorText}>{error}</Text> : null}

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                onPress={handlePress} 
                                style={[styles.confirmButton, pin.length < 4 && styles.disabledButton]}
                                disabled={pin.length < 4 || isLoading}
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
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        elevation: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
    },
    pinContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '80%',
        marginBottom: 20,
    },
    pinBox: {
        width: 50,
        height: 50,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f9f9f9',
    },
    pinBoxFilled: {
        borderColor: '#007BFF', // Active color
        backgroundColor: '#fff',
    },
    pinText: {
        fontSize: 24,
        color: '#333',
    },
    hiddenInput: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0, // Hide it but keep it interactive
    },
    errorText: {
        color: 'red',
        fontSize: 14,
        marginBottom: 15,
    },
    buttonContainer: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    cancelButton: {
        padding: 15,
        flex: 1,
        marginRight: 10,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#666',
        fontWeight: 'bold',
    },
    confirmButton: {
        backgroundColor: '#007BFF',
        padding: 15,
        borderRadius: 10,
        flex: 1,
        marginLeft: 10,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#ccc',
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
});

export default TransactionPinModal;