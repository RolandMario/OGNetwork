import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SIZES, FONTS } from '../constants/theme';

const TransactionSummaryModal = ({
  isVisible,
  onClose,
  onConfirm,
  transaction,
}) => {
  if (!transaction) return null;

  const {
    serviceType,      // 'Data', 'Airtime', 'Cable', 'Electricity'
    amount,           // in Naira
    commission,       // in Naira (commission amount)
    beneficiary,      // phone number, meter number, or plan name
    planDetails,      // plan name, size, validity, etc.
    provider,         // network or provider name
    totalAmount,      // amount + commission (optional, calculated if not provided)
  } = transaction;

  const commissionsAmount = commission || 0;
  const total = totalAmount || (amount + commissionsAmount);

  // Icons for different service types
  const getServiceIcon = () => {
    const type = String(serviceType || '').toLowerCase();
    if (type.includes('data')) return 'wifi';
    if (type.includes('airtime')) return 'phone';
    if (type.includes('cable')) return 'television';
    if (type.includes('electricity')) return 'lightning-bolt';
    return 'check-circle';
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Summary</Text>
          <View style={styles.spacer} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
          {/* Service Icon & Type */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons
                name={getServiceIcon()}
                size={48}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.serviceType}>{serviceType}</Text>
          </View>

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            {/* Beneficiary */}
            {beneficiary && (
              <View style={styles.summaryRow}>
                <View style={styles.rowLeft}>
                  <MaterialCommunityIcons
                    name="account-circle"
                    size={20}
                    color="#6b7280"
                  />
                  <Text style={styles.rowLabel}>Beneficiary</Text>
                </View>
                <Text style={styles.rowValue}>{beneficiary}</Text>
              </View>
            )}

            {/* Provider / Network */}
            {provider && (
              <View style={styles.summaryRow}>
                <View style={styles.rowLeft}>
                  <MaterialCommunityIcons
                    name="router-wireless"
                    size={20}
                    color="#6b7280"
                  />
                  <Text style={styles.rowLabel}>Provider</Text>
                </View>
                <Text style={styles.rowValue}>{provider}</Text>
              </View>
            )}

            {/* Plan Details */}
            {planDetails && (
              <View style={styles.summaryRow}>
                <View style={styles.rowLeft}>
                  <MaterialCommunityIcons
                    name="package-variant"
                    size={20}
                    color="#6b7280"
                  />
                  <Text style={styles.rowLabel}>Plan</Text>
                </View>
                <Text style={styles.rowValue}>{planDetails}</Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* Amount */}
            <View style={styles.summaryRow}>
              <Text style={styles.rowLabel}>Amount</Text>
              <Text style={styles.amountText}>₦{Number(amount).toLocaleString()}</Text>
            </View>

            {/* Commission */}
            {commissionsAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.rowLabel}>Commission</Text>
                <Text style={styles.commissionText}>
                  +₦{Number(commissionsAmount).toLocaleString()}
                </Text>
              </View>
            )}

            {/* Total */}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalAmount}>₦{Number(total).toLocaleString()}</Text>
            </View>
          </View>

          {/* Info Note */}
          <View style={styles.infoNote}>
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color="#0891b2"
            />
            <Text style={styles.infoText}>
              Please review the transaction details above before confirming.
            </Text>
          </View>
        </ScrollView>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onConfirm}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmButtonText}>Confirm & Pay</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  spacer: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceType: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  summaryCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'right',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#d1d5db',
    marginVertical: 8,
  },
  amountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'right',
  },
  commissionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
    textAlign: 'right',
  },
  totalRow: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3b82f6',
    textAlign: 'right',
  },
  infoNote: {
    flexDirection: 'row',
    backgroundColor: '#cffafe',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#0c4a6e',
    lineHeight: 18,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 16,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default TransactionSummaryModal;
