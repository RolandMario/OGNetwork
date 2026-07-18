"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

interface Transaction {
  _id: string;
  transactionReference: string;
  type: string;
  amount: number;
  status: string;
  user: { fullName?: string; email?: string; _id: string };
  details?: any;
  createdAt: string;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      
      const res = await fetch(`${API_BASE}/admin/transactions`, {
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
      if (!res.ok) throw new Error(data.message || "Failed to fetch transactions");
      
      setTransactions(data.data?.transactions || data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    if (filter !== "ALL" && tx.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        tx.transactionReference?.toLowerCase().includes(s) ||
        tx.type?.toLowerCase().includes(s) ||
        tx.user?.fullName?.toLowerCase().includes(s) ||
        tx.user?.email?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS": return "status-badge-success";
      case "PENDING": return "status-badge-pending";
      case "FAILED": return "status-badge-failed";
      default: return "status-badge-inactive";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-sm text-slate-500 mt-1">{transactions.length} total transactions</p>
        </div>
        <button
          onClick={fetchTransactions}
          className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
        </div>
        <div className="flex gap-2">
          {["ALL", "SUCCESS", "PENDING", "FAILED"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
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
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">No transactions found</td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx._id} className="text-sm text-slate-700 hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs">{tx.transactionReference || "—"}</td>
                      <td className="px-5 py-3">
                        <div className="font-medium">{tx.user?.fullName || "Unknown"}</div>
                        <div className="text-xs text-slate-400">{tx.user?.email || ""}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium">₦{(tx.amount / 100).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <span className={`status-badge ${getStatusColor(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(tx.createdAt).toLocaleDateString("en-NG", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}