'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';

interface Plan {
  _id: string;
  planName: string;
  description?: string;
  provider: string;
  providerPrice: number | string;
  ourPrice: number | string;
}

interface SummaryItem {
  _id: string;
  count: number;
}

interface SyncResponse {
  data: {
    synced: number;
    skipped: number;
  };
}

interface PlansResponse {
  data: {
    plans: Plan[];
  };
}

interface SummaryResponse {
  data: {
    summary: SummaryItem[];
  };
}

const AdminDashboard: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [selectedService, setSelectedService] = useState<'data' | 'cable' | 'electricity'>('data');
  const [page, setPage] = useState<number>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');

  const getToken = (): string | null => localStorage.getItem('adminToken');

  // =========================================================================
  // Sync plans from Peyflex
  // =========================================================================
  const handleSyncPlans = async () => {
    const token = getToken();
    if (!token) {
      alert('No admin token found. Please log in again.');
      return;
    }

    setSyncing(true);
    try {
      const response = await axios.post<SyncResponse>(
        `${API_BASE}/admin/sync-plans`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': 'demo',
          },
        }
      );

      const { synced, skipped } = response.data.data;
      alert(`Sync complete: ${synced} synced, ${skipped} skipped`);
      fetchPlans();
    } catch (err: any) {
      alert(`Sync failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // =========================================================================
  // Fetch plans
  // =========================================================================
  const fetchPlans = async () => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const response = await axios.get<PlansResponse>(
        `${API_BASE}/admin/plans?service=${selectedService}&page=${page}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': 'demo',
          },
        }
      );
      setPlans(response.data.data.plans);
    } catch (err: any) {
      alert(`Failed to fetch plans: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // Fetch summary
  // =========================================================================
  const fetchSummary = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await axios.get<SummaryResponse>(
        `${API_BASE}/admin/plans/summary`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': 'demo',
          },
        }
      );
      setSummary(response.data.data.summary);
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  };

  // =========================================================================
  // Update single plan price
  // =========================================================================
  const handleUpdatePrice = async (planId: string) => {
    const token = getToken();
    if (!token) return;

    if (!editPrice || isNaN(Number(editPrice))) {
      alert('Please enter a valid price');
      return;
    }

    try {
      await axios.patch(
        `${API_BASE}/admin/plans/${planId}`,
        { ourPrice: Number(editPrice) },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': 'demo',
          },
        }
      );

      alert('Price updated successfully');
      setEditingId(null);
      setEditPrice('');
      fetchPlans();
    } catch (err: any) {
      alert(`Update failed: ${err.response?.data?.message || err.message}`);
    }
  };

  // =========================================================================
  // Load data on mount and when service/page changes
  // =========================================================================
  useEffect(() => {
    fetchPlans();
    fetchSummary();
  }, [selectedService, page]);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>💰 Service Plan Pricing Manager</h1>

      {/* Control Bar */}
      <div style={styles.controlBar}>
        <button
          onClick={handleSyncPlans}
          disabled={syncing}
          style={{ ...styles.button, ...styles.syncButton }}
        >
          {syncing ? 'Syncing...' : '🔄 Sync Plans from Peyflex'}
        </button>

        <select
          value={selectedService}
          onChange={(e) => {
            setSelectedService(e.target.value as 'data' | 'cable' | 'electricity');
            setPage(1);
          }}
          style={styles.select}
        >
          <option value="data">📱 Data</option>
          <option value="cable">📺 Cable TV</option>
          <option value="electricity">⚡ Electricity</option>
        </select>
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        <h3>Summary</h3>
        <div style={styles.summaryGrid}>
          {summary.map((item) => (
            <div key={item._id} style={styles.summaryCard}>
              <div style={styles.summaryCount}>{item.count}</div>
              <div style={styles.summaryLabel}>{item._id}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th>Plan Name</th>
              <th>Provider</th>
              <th>Provider Price</th>
              <th>Your Price</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={styles.loading}>
                  Loading...
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={5} style={styles.empty}>
                  No plans found. Click &quot;Sync Plans&quot; to get started.
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan._id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <strong>{plan.planName}</strong>
                    {plan.description && <small> — {plan.description}</small>}
                  </td>
                  <td style={styles.tableCell}>{plan.provider}</td>
                  <td style={styles.tableCell}>
                    ₦{Number(plan.providerPrice).toLocaleString()}
                  </td>
                  <td style={styles.tableCell}>
                    {editingId === plan._id ? (
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        style={styles.input}
                      />
                    ) : (
                      <strong style={{ color: '#2ECC71' }}>
                        ₦{Number(plan.ourPrice).toLocaleString()}
                      </strong>
                    )}
                  </td>
                  <td style={styles.tableCell}>
                    {editingId === plan._id ? (
                      <>
                        <button
                          onClick={() => handleUpdatePrice(plan._id)}
                          style={styles.buttonSmall}
                        >
                          ✓ Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditPrice('');
                          }}
                          style={{ ...styles.buttonSmall, backgroundColor: '#888' }}
                        >
                          ✗ Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(plan._id);
                          setEditPrice(String(plan.ourPrice));
                        }}
                        style={styles.buttonSmall}
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && plans.length > 0 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={styles.button}
          >
            ← Previous
          </button>
          <span style={styles.pageInfo}>Page {page}</span>
          <button onClick={() => setPage(page + 1)} style={styles.button}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

const styles = {
  // ... (same styles as before)
  container: { width: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' },
  title: { textAlign: 'center' as const, marginBottom: '30px', color: '#333' },
  controlBar: { display: 'flex', gap: '10px', marginBottom: '20px' },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#4c00b0',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold' as const,
  },
  syncButton: { backgroundColor: '#27AE60' },
  select: { padding: '10px 15px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ddd', cursor: 'pointer' },
  summary: { marginBottom: '30px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginTop: '10px' },
  summaryCard: { backgroundColor: '#fff', padding: '15px', borderRadius: '6px', textAlign: 'center' as const, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  summaryCount: { fontSize: '28px', fontWeight: 'bold' as const, color: '#4c00b0' },
  summaryLabel: { fontSize: '12px', color: '#666', marginTop: '5px', textTransform: 'uppercase' as const },
  tableWrapper: { overflowX: 'auto', marginBottom: '20px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  tableHeader: { backgroundColor: '#4c00b0', color: '#fff' },
  tableRow: { borderBottom: '1px solid #eee' },
  tableCell: { padding: '12px', textAlign: 'left' as const },
  input: { padding: '6px 10px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '4px', width: '100px' },
  buttonSmall: { padding: '6px 12px', fontSize: '12px', marginRight: '5px', backgroundColor: '#4c00b0', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  loading: { textAlign: 'center' as const, padding: '20px', color: '#999' },
  empty: { textAlign: 'center' as const, padding: '20px', color: '#999' },
  pagination: { display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' },
  pageInfo: { padding: '10px 20px', color: '#666' },
} as const;

export default AdminDashboard;