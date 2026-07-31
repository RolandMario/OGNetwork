"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

interface Wallet {
  _id: string;
  user: { fullName?: string; email?: string; _id: string };
  balance: number;
  currency: string;
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

export default function WalletsPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal states
  const [fundModal, setFundModal] = useState<{ wallet: Wallet } | null>(null);
  const [debitModal, setDebitModal] = useState<{ wallet: Wallet } | null>(null);
  const [modalAmount, setModalAmount] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      
      const res = await fetch(`${API_BASE}/admin/wallets`, {
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
      if (!res.ok) throw new Error(data.message || "Failed to fetch wallets");
      
      setWallets(data.data?.wallets || data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
        body: JSON.stringify({ userId: fundModal.wallet.user._id, amount, note: modalNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fund wallet");
      setModalMessage({ type: 'success', text: data.message });
      setModalAmount("");
      setModalNote("");
      // Refresh wallets to show updated balance
      fetchWallets();
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
        body: JSON.stringify({ userId: debitModal.wallet.user._id, amount, note: modalNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to debit wallet");
      setModalMessage({ type: 'success', text: data.message });
      setModalAmount("");
      setModalNote("");
      // Refresh wallets to show updated balance
      fetchWallets();
    } catch (err: any) {
      setModalMessage({ type: 'error', text: err.message });
    } finally {
      setModalLoading(false);
    }
  };

  const filteredWallets = wallets.filter(w =>
    w.user?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    w.user?.email?.toLowerCase().includes(search.toLowerCase())
  );

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Wallets</h1>
          <p className="text-sm text-slate-500 mt-1">
            {wallets.length} wallets • Total balance: ₦{(totalBalance / 100).toLocaleString()}
          </p>
        </div>
        <button
          onClick={fetchWallets}
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
          placeholder="Search wallets by user name or email..."
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
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Balance</th>
                  <th className="px-5 py-3">Currency</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWallets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">No wallets found</td>
                  </tr>
                ) : (
                  filteredWallets.map((wallet) => (
                    <tr key={wallet._id} className="text-sm text-slate-700 hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-medium">{wallet.user?.fullName || "Unknown"}</div>
                        <div className="text-xs text-slate-400">{wallet.user?.email || ""}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-lg">
                          ₦{(wallet.balance / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{wallet.currency}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(wallet.createdAt).toLocaleDateString("en-NG", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setFundModal({ wallet }); setModalAmount(""); setModalNote(""); setModalMessage(null); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          >
                            Fund
                          </button>
                          <button
                            onClick={() => { setDebitModal({ wallet }); setModalAmount(""); setModalNote(""); setModalMessage(null); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                          >
                            Debit
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
        <Modal title={`Fund Wallet — ${fundModal.wallet.user?.fullName || "Unknown"}`} onClose={() => setFundModal(null)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Current balance: <strong>₦{(fundModal.wallet.balance / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</strong>
            </div>
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
        <Modal title={`Debit Wallet — ${debitModal.wallet.user?.fullName || "Unknown"}`} onClose={() => setDebitModal(null)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Current balance: <strong>₦{(debitModal.wallet.balance / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</strong>
            </div>
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
    </div>
  );
}