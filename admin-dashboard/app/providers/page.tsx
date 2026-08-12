"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

// Warn when a provider's account balance drops below this (in Naira).
const LOW_BALANCE_THRESHOLD = 1000;

interface ProviderBalance {
  provider: string;
  accountBalance: number;
  walletBalance: number;
  bonusBalance: number;
  currency: string;
  retrievedAt: string;
}

interface ProviderError {
  provider: string;
  message: string;
}

const PROVIDER_META: Record<string, { label: string; color: string; text: string }> = {
  datastation: { label: "Datastation", color: "bg-blue-100", text: "text-blue-700" },
  geodnatech: { label: "Geodnatech", color: "bg-emerald-100", text: "text-emerald-700" },
  gladtidings: { label: "Gladtidings", color: "bg-purple-100", text: "text-purple-700" },
};

const fmtNGN = (n: number) =>
  `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProvidersPage() {
  const router = useRouter();
  const [balances, setBalances] = useState<ProviderBalance[]>([]);
  const [errors, setErrors] = useState<ProviderError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const fetchBalances = useCallback(async () => {
    const token = localStorage.getItem("adminToken");
    const tenantId = localStorage.getItem("tenantId") || "demo";
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/providers/balances`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
      });
      if (res.status === 401) {
        localStorage.removeItem("adminToken");
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to fetch provider balances");
      setBalances(json.data?.balances || []);
      setErrors(json.data?.errors || []);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString("en-NG"));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchBalances();
    // Auto-refresh every 60s so balances stay current while monitoring.
    const id = setInterval(fetchBalances, 60000);
    return () => clearInterval(id);
  }, [fetchBalances, router]);

  const totalLow = balances.filter((b) => b.accountBalance < LOW_BALANCE_THRESHOLD).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Provider Wallets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor VTU provider funding balances{lastUpdated ? ` • Last updated ${lastUpdated}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalLow > 0 && (
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              {totalLow} provider{totalLow > 1 ? "s" : ""} low on balance
            </span>
          )}
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
      )}

      {loading && balances.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {balances.map((b) => {
            const meta = PROVIDER_META[b.provider] || {
              label: b.provider.charAt(0).toUpperCase() + b.provider.slice(1),
              color: "bg-slate-100",
              text: "text-slate-700",
            };
            const isLow = b.accountBalance < LOW_BALANCE_THRESHOLD;
            return (
              <div key={b.provider} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-2 py-1 rounded-lg text-sm font-semibold ${meta.color} ${meta.text}`}>
                    {meta.label}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isLow ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {isLow ? "LOW" : "OK"}
                  </span>
                </div>

                <p className="text-xs text-slate-500">Account Balance</p>
                <p className={`text-2xl font-bold mt-1 ${isLow ? "text-red-600" : "text-slate-900"}`}>
                  {fmtNGN(b.accountBalance)}
                </p>
                <p className="text-xs mt-2 text-slate-500">
                  {b.walletBalance} wallet • {fmtNGN(b.bonusBalance)} bonus • {b.currency}
                </p>

                {isLow && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                    Balance is below ₦{LOW_BALANCE_THRESHOLD.toLocaleString()}. Please fund this provider soon.
                  </div>
                )}
              </div>
            );
          })}

          {balances.length === 0 && !loading && (
            <div className="col-span-full text-center py-12 text-slate-500">
              No provider balances available
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && balances.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Some providers could not be fetched</h3>
          <ul className="text-xs text-amber-700 space-y-1">
            {errors.map((e) => (
              <li key={e.provider}>
                <span className="font-semibold capitalize">{e.provider}:</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

