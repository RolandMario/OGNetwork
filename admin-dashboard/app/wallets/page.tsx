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

export default function WalletsPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWallets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">No wallets found</td>
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