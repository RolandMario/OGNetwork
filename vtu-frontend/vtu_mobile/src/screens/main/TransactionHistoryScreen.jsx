import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

const TransactionHistoryScreen = ({ navigation }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, airtime, data, wallet

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get('https://vtu-project.vercel.app/api/v1/user/transactions/my-history', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': 'clientA'
        }
      });
      setTransactions(response.data.data);
    } catch (error) {
      console.error("Error fetching transactions", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'success': return '#E6FFFA';
      case 'failed': return '#FFF5F5';
      case 'pending': return '#FFFBEB';
      default: return COLORS.backgroundMain;
    }
  };

  const getStatusTextColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'success': return '#38A169';
      case 'failed': return '#E53E3E';
      case 'pending': return '#D69E2E';
      default: return COLORS.textPrimary;
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.transactionCard}
      onPress={() => navigation.navigate('TransactionDetail', { transactionId: item._id })}
    >
      <View style={[styles.iconBox, { backgroundColor: item.type === 'airtime' ? '#EBF8FF' : '#FAF5FF' }]}>
        <MaterialCommunityIcons 
          name={item.type === 'airtime' ? "phone-outgoing" : "wallet-plus"} 
          size={24} 
          color={item.type === 'airtime' ? COLORS.primary : COLORS.accent} 
        />
      </View>

      <View style={styles.details}>
        <Text style={styles.transTitle}>{item.description || ` ${item.type}` ||`${item.network?.toUpperCase()}`}</Text>
        <Text style={styles.transDate}>{new Date(item.createdAt).toLocaleDateString()} • {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
      </View>

      <View style={styles.amountContainer}>
        <Text style={[styles.amountText, { color: item.type === 'funding' ? '#38A169' : COLORS.textPrimary }]}>
          {item.type === 'funding' ? '+' : '-'}₦{item.amount}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={[styles.statusText, { color: getStatusTextColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transactions</Text>
        <TouchableOpacity onPress={fetchTransactions}>
          <Ionicons name="refresh" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['all', 'airtime', 'data', 'funding'].map((tab) => (
          <TouchableOpacity 
            key={tab} 
            onPress={() => setFilter(tab)}
            style={[styles.filterTab, filter === tab && styles.activeFilterTab]}
          >
            <Text style={[styles.filterTabText, filter === tab && styles.activeFilterTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={transactions.filter(t => filter === 'all' || t.type === filter.toUpperCase())}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchTransactions} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={80} color={COLORS.border} />
              <Text style={styles.emptyText}>No transactions found</Text>
            </View>
          }
        />
      )}
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
    backgroundColor: '#FFF' 
  },
  headerTitle: { ...FONTS.bold, fontSize: 18 },
  filterRow: { 
    flexDirection: 'row', 
    paddingHorizontal: 15, 
    marginVertical: 10,
    justifyContent: 'space-between'
  },
  filterTab: { 
    paddingVertical: 8, 
    paddingHorizontal: 15, 
    borderRadius: 20, 
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: COLORS.border
  },
  activeFilterTab: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterTabText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  activeFilterTabText: { color: '#FFF' },
  listContent: { padding: 15 },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: SIZES.radius,
    marginBottom: 12,
    ...SHADOWS.light
  },
  iconBox: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  details: { flex: 1, marginLeft: 15 },
  transTitle: { ...FONTS.bold, fontSize: 14, color: COLORS.textPrimary },
  transDate: { ...FONTS.regular, fontSize: 12, color: COLORS.gray, marginTop: 4 },
  amountContainer: { alignItems: 'flex-end' },
  amountText: { ...FONTS.bold, fontSize: 15 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 5 },
  statusText: { fontSize: 10, fontWeight: 'bold', textTransform: 'capitalize' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 10, color: COLORS.gray, fontSize: 16 }
});

export default TransactionHistoryScreen;