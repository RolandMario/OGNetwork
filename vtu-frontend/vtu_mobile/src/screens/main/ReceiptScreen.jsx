import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSelector } from 'react-redux';

import { COLORS, FONTS, SHADOWS } from '../../constants/theme';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';
import {
  buildReceiptRows,
  buildReceiptHtml,
  buildReceiptText,
  formatReceiptDate,
} from '../../utils/receipt';

// ---------------------------------------------------------------------------
// Receipt screen — renders an on-screen receipt and lets the user share it as
// a PDF (or plain text when PDF generation is unavailable).
// ---------------------------------------------------------------------------
const ReceiptScreen = ({ navigation, route }) => {
  const { transactionId, transaction: initialTransaction } = route.params || {};

  const authUser = useSelector((state) => state.auth?.user);

  const [transaction, setTransaction] = useState(initialTransaction || null);
  const [loading, setLoading] = useState(!initialTransaction);
  const [sharing, setSharing] = useState(false);

  // Fetch the latest canonical transaction from the backend when only an id is
  // provided (e.g. right after a purchase completes).
  useEffect(() => {
    if (!transactionId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(API_ROUTES.USER.TRANSACTION_DETAIL(transactionId));
        if (!cancelled && response.data?.data?.transaction) {
          setTransaction(response.data.data.transaction);
        }
      } catch (error) {
        console.error('[Receipt] load error:', error.response?.data || error.message);
        if (!cancelled) {
          Alert.alert('Unable to load receipt', 'Could not fetch this transaction. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  const user = authUser || transaction?.user || null;

  // -------------------------------------------------------------------------
  // Share as PDF
  // -------------------------------------------------------------------------
  const shareReceipt = useCallback(async () => {
    if (!transaction) return;
    setSharing(true);
    try {
      const html = buildReceiptHtml({ transaction, user });
      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Receipt',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Fallback when the native share sheet is unavailable
        const text = buildReceiptText({ transaction, user });
        await Share.share({ title: 'Transaction Receipt', message: text });
      }
    } catch (error) {
      console.error('[Receipt] share failed:', error);
      // Fallback to plain-text sharing via the built-in share sheet so the
      // user is never left without a way to share their receipt.
      try {
        const text = buildReceiptText({ transaction, user });
        await Share.share({ title: 'Transaction Receipt', message: text });
      } catch (shareError) {
        Alert.alert('Share failed', 'Could not share the receipt right now. Please try again.');
      }
    } finally {
      setSharing(false);
    }
  }, [transaction, user]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Generating receipt…</Text>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <Ionicons name="receipt-outline" size={64} color="#CBD5E1" />
        <Text style={styles.loadingText}>No receipt available.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const rows = buildReceiptRows({ transaction, user });
  const status = transaction.status || 'PENDING';
  const statusColor = status === 'SUCCESS' ? '#38A169' : status === 'FAILED' ? '#E53E3E' : '#D69E2E';
  const customerName = user
    ? [user.fullName, user.phone, user.email].filter(Boolean).join(' • ')
    : '';
  const totalAmount = (Number(transaction.amount || 0) / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receipt</Text>
        <TouchableOpacity onPress={shareReceipt} disabled={sharing} style={styles.shareIconBtn}>
          {sharing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="share-social-outline" size={22} color={COLORS.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Receipt card */}
        <View style={styles.receiptCard}>
          {/* Brand header */}
          <View style={styles.brandHeader}>
            <Text style={styles.brandText}>OG NETWORK</Text>
            <Text style={styles.brandTagline}>VTU &amp; BILLS SERVICES</Text>
            <Text style={styles.receiptLabel}>OFFICIAL RECEIPT</Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
              <Text style={styles.statusPillText}>{status}</Text>
            </View>
          </View>

          {/* Customer */}
          <View style={styles.customerBox}>
            {customerName ? (
              <Text style={styles.customerName} numberOfLines={2}>{customerName}</Text>
            ) : null}
            {user?.phone ? <Text style={styles.customerMeta}>{user.phone}</Text> : null}
            {user?.email ? <Text style={styles.customerMeta}>{user.email}</Text> : null}
          </View>

          {/* Rows */}
          <View style={styles.rowsContainer}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Date &amp; Time</Text>
              <Text style={styles.rowValue}>{formatReceiptDate(transaction.createdAt)}</Text>
            </View>
            {rows.map((item, index) => (
              <View key={`${item.label}-${index}`} style={styles.row}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={[styles.rowValue, item.label === 'Amount Paid' && styles.amountValue]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Total */}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>₦{totalAmount}</Text>
          </View>
        </View>

        <Text style={styles.footerNote}>
          This is a system-generated receipt for transaction {transaction.transactionReference}.
        </Text>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.shareBtn} onPress={shareReceipt} disabled={sharing}>
          {sharing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="share-social" size={18} color="#FFF" />
              <Text style={styles.shareBtnText}>Share Receipt</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundMain },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textSecondary, fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
  },
  backBtn: { padding: 4 },
  headerTitle: { ...FONTS.bold, fontSize: 18 },
  shareIconBtn: { padding: 4 },
  content: { padding: 16, paddingBottom: 24 },
  receiptCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.medium,
  },
  brandHeader: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  brandText: { color: '#FFF', ...FONTS.bold, fontSize: 22, letterSpacing: 1 },
  brandTagline: { color: '#98C1D9', fontSize: 10, letterSpacing: 1, marginTop: 3, textAlign: 'center' },
  receiptLabel: { color: COLORS.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: 12 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 10 },
  statusPillText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  customerBox: { backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#EDF2F7', padding: 14 },
  customerName: { ...FONTS.semiBold, fontSize: 14, color: COLORS.primary },
  customerMeta: { fontSize: 12, color: '#64748B', marginTop: 3 },
  rowsContainer: { paddingHorizontal: 16, paddingVertical: 6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    borderStyle: 'dashed',
    gap: 12,
  },
  rowLabel: { flexShrink: 1, fontSize: 12.5, color: COLORS.textSecondary },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 12.5, fontWeight: '600', color: COLORS.textPrimary },
  amountValue: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 16,
    padding: 14,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: '#065F46' },
  totalValue: { fontSize: 19, fontWeight: '800', color: '#047857' },
  footerNote: { textAlign: 'center', color: '#94A3B8', fontSize: 11, marginTop: 14, lineHeight: 16 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneBtnText: { color: '#475569', fontWeight: '600', fontSize: 15 },
});

export default ReceiptScreen;