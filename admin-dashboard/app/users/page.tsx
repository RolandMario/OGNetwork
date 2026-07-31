"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

const USER_LEVELS = ['normal', 'affiliate', 'top_user', 'api_user'];

interface User {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  isPinSet: boolean;
  level: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Modal Component
// ---------------------------------------------------------------------------
function Modal({ title, children, onClose }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [updatingLevel, setUpdatingLevel] = useState<string | null>(null);

  // Modal states
  const [fundModal, setFundModal] = useState<{ user: User } | null>(null);
  const [debitModal, setDebitModal] = useState<{ user: User } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ user: User } | null>(null);
  const [modalAmount, setModalAmount] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
        },
      });
      
      if (res.status === 401) {
        localStorage.removeItem("adminToken");
        router.push("/login");
        return;
      }
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch users");
      
      setUsers(data.data?.users || data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      
      const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      
      if (!res.ok) throw new Error("Failed to update user status");
      
      setUsers(users.map(u => 
        u._id === userId ? { ...u, isActive: !currentStatus } : u
      ));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateUserLevel = async (userId: string, newLevel: string) => {
    try {
      setUpdatingLevel(userId);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      
      const res = await fetch(`${API_BASE}/admin/users/${userId}/level`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ level: newLevel }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update user level");
      }
      
      setUsers(users.map(u => 
        u._id === userId ? { ...u, level: newLevel } : u
      ));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingLevel(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Fund Wallet
  // ---------------------------------------------------------------------------
  const handleFund = async () => {
    if (!fundModal) return;
    setModalMessage(null);
    const amount = parseFloat(modalAmount);
    if (!amount || amount <= 0) {
      setModalMessage({ type: 'error', text: 'Please enter a valid positive amount.' });
      return;
    }
    try {
      setModalLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      const res = await fetch(`${API_BASE}/admin/wallets/fund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: fundModal.user._id, amount, note: modalNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fund wallet");
      setModalMessage({ type: 'success', text: data.message });
      setModalAmount("");
      setModalNote("");
    } catch (err: any) {
      setModalMessage({ type: 'error', text: err.message });
    } finally {
      setModalLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Debit Wallet
  // ---------------------------------------------------------------------------
  const handleDebit = async () => {
    if (!debitModal) return;
    setModalMessage(null);
    const amount = parseFloat(modalAmount);
    if (!amount || amount <= 0) {
      setModalMessage({ type: 'error', text: 'Please enter a valid positive amount.' });
      return;
    }
    try {
      setModalLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      const res = await fetch(`${API_BASE}/admin/wallets/debit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: debitModal.user._id, amount, note: modalNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to debit wallet");
      setModalMessage({ type: 'success', text: data.message });
      setModalAmount("");
      setModalNote("");
    } catch (err: any) {
      setModalMessage({ type: 'error', text: err.message });
    } finally {
      setModalLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete User
  // ---------------------------------------------------------------------------
  const handleDelete = async () => {
    if (!deleteModal) return;
    setModalMessage(null);
    try {
      setModalLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      const res = await fetch(`${API_BASE}/admin/users/${deleteModal.user._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete user");
      setModalMessage({ type: 'success', text: data.message });
      // Remove user from list
      setUsers(users.filter(u => u._id !== deleteModal.user._id));
    } catch (err: any) {
      setModalMessage({ type: 'error', text: err.message });
    } finally {
      setModalLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  );

  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case 'normal': return 'bg-slate-100 text-slate-700';
      case 'affiliate': return 'bg-blue-100 text-blue-700';
      case 'top_user': return 'bg-amber-100 text-amber-700';
      case 'api_user': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-1">{users.length} total users</p>
        </div>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search users by name, email or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Level</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">PIN</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-slate-500">No users found</td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user._id} className="text-sm text-slate-700 hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium">{user.fullName}</td>
                      <td className="px-5 py-3 text-slate-500">{user.email}</td>
                      <td className="px-5 py-3">{user.phone}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={user.level || 'normal'}
                          onChange={(e) => updateUserLevel(user._id, e.target.value)}
                          disabled={updatingLevel === user._id}
                          className={`px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${getLevelBadgeColor(user.level || 'normal')}`}
                        >
                          {USER_LEVELS.map(level => (
                            <option key={level} value={level}>
                              {level.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`status-badge ${user.isActive ? "status-badge-active" : "status-badge-inactive"}`}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.isPinSet ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {user.isPinSet ? "Set" : "Not Set"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setFundModal({ user }); setModalAmount(""); setModalNote(""); setModalMessage(null); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          >
                            Fund
                          </button>
                          <button
                            onClick={() => { setDebitModal({ user }); setModalAmount(""); setModalNote(""); setModalMessage(null); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                          >
                            Debit
                          </button>
                          <button
                            onClick={() => toggleUserStatus(user._id, user.isActive)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                              user.isActive
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-green-50 text-green-600 hover:bg-green-100"
                            }`}
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => { setDeleteModal({ user }); setModalMessage(null); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fund Modal */}
      {fundModal && (
        <Modal title={`Fund Wallet — ${fundModal.user.fullName}`} onClose={() => setFundModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={modalAmount}
                onChange={(e) => setModalAmount(e.target.value)}
                placeholder="e.g. 1000"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
              <input
                type="text"
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                placeholder="Reason for funding"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            {modalMessage && (
              <div className={`text-sm p-3 rounded-lg ${
                modalMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {modalMessage.text}
              </div>
            )}
            <button
              onClick={handleFund}
              disabled={modalLoading}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modalLoading ? "Processing..." : "Fund Wallet"}
            </button>
          </div>
        </Modal>
      )}

      {/* Debit Modal */}
      {debitModal && (
        <Modal title={`Debit Wallet — ${debitModal.user.fullName}`} onClose={() => setDebitModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={modalAmount}
                onChange={(e) => setModalAmount(e.target.value)}
                placeholder="e.g. 500"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
              <input
                type="text"
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                placeholder="Reason for debit"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            {modalMessage && (
              <div className={`text-sm p-3 rounded-lg ${
                modalMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {modalMessage.text}
              </div>
            )}
            <button
              onClick={handleDebit}
              disabled={modalLoading}
              className="w-full py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modalLoading ? "Processing..." : "Debit Wallet"}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <Modal title="Delete User" onClose={() => setDeleteModal(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <p className="font-medium mb-1">⚠️ Irreversible Action</p>
              <p>This will permanently delete <strong>{deleteModal.user.fullName}</strong> ({deleteModal.user.email}) along with their wallet and all transaction history.</p>
            </div>
            {modalMessage && (
              <div className={`text-sm p-3 rounded-lg ${
                modalMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {modalMessage.text}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={modalLoading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {modalLoading ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}