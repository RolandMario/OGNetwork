import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';
import apiClient from '../../services/api';
import { API_ROUTES } from '../../constants/apiRoutes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FILTERS = ['ALL', 'FUNDING', 'AIRTIME', 'DATA', 'CABLE', 'ELECTRICITY'];

const TYPE_ICON = {
  AIRTIME:     { name: 'phone-outgoing',   color: COLORS.primary,           bg: '#EBF8FF' },
  DATA:        { name: 'wifi',             color: '#805AD5',                bg: '#FAF5FF' },
  CABLE:       { name: 'television-play',  color: '#DD6B20',                bg: '#FFFAF0' },
  ELECTRICITY: { name: 'lightning-bolt',   color: '#D69E2E',                bg: '#FFFFF0' },
  FUNDING:     { name: 'wallet-plus',      color: '#38A169',                bg: '#F0FFF4' },
};

const STATUS_STYLES = {
  SUCCESS: { bg: '#E6FFFA', text: '#38A169' },
  FAILED:  { bg: '#FFF5F5', text: '#E53E3E' },
  PENDING: { bg: '#FFFBEB', text: '#D69E2E' },
  REVERSED:{ bg: '#EDF2F7', text: '#718096' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatAmount(amountKobo) {
  return (amountKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function getTransactionTitle(tx) {
  const { type, details } = tx;
  switch (type) {
    case 'AIRTIME':     return `${details?.network?.toUpperCase() || ''} Airtime — ${details?.beneficiary || ''}`;
    case 'DATA':        return `${details?.planName || details?.planId || 'Data Bundle'} — ${details?.beneficiary || ''}`;
    case 'CABLE':       return `${details?.planName || details?.planId || 'Cable TV'} — IUC ${details?.beneficiary || ''}`;
    case 'ELECTRICITY': return `${details?.planName || 'Electricity'} — Meter ${details?.beneficiary || ''}`;
    case 'FUNDING':     return 'Wallet Funding';
    default:            return type || 'Transaction';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const TransactionHistoryScreen = ({ navigation }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [filter,       setFilter]       = useState('ALL');
  const [page,         setPage]         = useState(1);
  const [hasMore,      setHasMore]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch transactions
  // ---------------------------------------------------------------------------
  const fetchTransactions = useCallback(async ({
    pageNum  = 1,
    type     = filter,
    append   = false,
  } = {}) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = { page: pageNum, limit: 20 };
      if (type !== 'ALL') params.type = type;

      const response = await apiClient.get(API_ROUTES.USER.TRANSACTION_HISTORY, { params });

      const { transactions: txList, pagination } = response.data.data;

      // FIX: amounts in DB are in kobo — no conversion needed here, handled in formatAmount
      setTransactions((prev) => append ? [...prev, ...txList] : txList);
      setHasMore(pagination.hasMore);
      setPage(pageNum);

    } catch (error) {
      console.error('[TransactionHistory] fetch error:', error.response?.data || error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTransactions({ pageNum: 1 });
  }, [filter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions({ pageNum: 1 });
  };

  const onLoadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    fetchTransactions({ pageNum: page + 1, append: true });
  };

  // ---------------------------------------------------------------------------
  // Render item
  // ---------------------------------------------------------------------------
  const renderItem = useCallback(({ item }) => {
    const isFunding  = item.type === 'FUNDING';
    const icon       = TYPE_ICON[item.type] || TYPE_ICON.FUNDING;
    const statusStyle= STATUS_STYLES[item.status] || STATUS_STYLES.PENDING;
    const { date, time } = formatDate(item.createdAt);
    const title      = getTransactionTitle(item);

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        {/* Icon */}
        <View style={[styles.iconBox, { backgroundColor: icon.bg }]}>
          <MaterialCommunityIcons name={icon.name} size={22} color={icon.color} />
        </View>

        {/* Details */}
        <View style={styles.details}>
          <Text style={styles.transTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.transDate}>{date} • {time}</Text>
          <Text style={styles.transRef} numberOfLines={1}>{item.transactionReference}</Text>
        </View>

        {/* Amount + Status */}
        <View style={styles.amountContainer}>
          <Text style={[styles.amountText, { color: isFunding ? '#38A169' : COLORS.textPrimary }]}>
            {isFunding ? '+' : '-'}₦{formatAmount(item.amount)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transactions</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrapper}>
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setFilter(item)}
              style={[styles.filterTab, filter === item && styles.activeFilterTab]}
            >
              <Text style={[styles.filterTabText, filter === item && styles.activeFilterTabText]}>
                {item.charAt(0) + item.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={80} color={COLORS.border || '#ccc'} />
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptySubText}>Your transaction history will appear here</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: COLORS.backgroundMain },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: '#FFF' },
  headerTitle:        { ...FONTS.bold, fontSize: 18 },
  filterWrapper:      { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  filterRow:          { paddingHorizontal: 15, paddingVertical: 10, gap: 8 },
  filterTab:          { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  activeFilterTab:    { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterTabText:      { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  activeFilterTabText:{ color: '#FFF' },
  listContent:        { padding: 15, paddingBottom: 40 },
  card:               { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: SIZES.radius, marginBottom: 10, ...SHADOWS.light },
  iconBox:            { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  details:            { flex: 1, marginLeft: 12 },
  transTitle:         { ...FONTS.bold, fontSize: 13, color: COLORS.textPrimary },
  transDate:          { ...FONTS.regular, fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  transRef:           { ...FONTS.regular, fontSize: 10, color: '#A0AEC0', marginTop: 2 },
  amountContainer:    { alignItems: 'flex-end' },
  amountText:         { ...FONTS.bold, fontSize: 14 },
  statusBadge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginTop: 5 },
  statusText:         { fontSize: 10, fontWeight: 'bold' },
  emptyContainer:     { alignItems: 'center', marginTop: 80 },
  emptyTitle:         { ...FONTS.bold, fontSize: 16, color: COLORS.textPrimary, marginTop: 15 },
  emptySubText:       { ...FONTS.regular, fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
});

export default TransactionHistoryScreen;