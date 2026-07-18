"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

async function fetchWithAuth(endpoint: string, options?: RequestInit) {
  const token = localStorage.getItem("adminToken");
  const tenantId = localStorage.getItem("tenantId") || "demo";

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-id": tenantId,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("adminToken");
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export default function SettingsPage() {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(API_BASE);
  const [saved, setSaved] = useState(false);

  // Airtime profit state
  const [airtimeProfitPercent, setAirtimeProfitPercent] = useState(0);
  const [profitLoading, setProfitLoading] = useState(true);
  const [profitSaving, setProfitSaving] = useState(false);
  const [profitSaved, setProfitSaved] = useState(false);
  const [profitError, setProfitError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchAirtimeProfitConfig();
  }, []);

  const fetchAirtimeProfitConfig = async () => {
    try {
      setProfitLoading(true);
      const data = await fetchWithAuth("/admin/config/airtime-profit");
      setAirtimeProfitPercent(data.data.profitPercent);
    } catch (err: any) {
      setProfitError(err.message);
    } finally {
      setProfitLoading(false);
    }
  };

  const handleSaveAirtimeProfit = async () => {
    try {
      setProfitSaving(true);
      setProfitError(null);
      await fetchWithAuth("/admin/config/airtime-profit", {
        method: "PATCH",
        body: JSON.stringify({ profitPercent: airtimeProfitPercent }),
      });
      setProfitSaved(true);
      setTimeout(() => setProfitSaved(false), 3000);
    } catch (err: any) {
      setProfitError(err.message);
    } finally {
      setProfitSaving(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClearData = () => {
    if (confirm("Are you sure you want to clear all local data? This will log you out.")) {
      localStorage.clear();
      router.push("/login");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your admin panel</p>
      </div>

      {/* Airtime Profit Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Airtime Profit Configuration</h2>
        <p className="text-sm text-slate-500 mb-4">
          Set the profit percentage applied to all airtime purchases. For example, 2% means ₦2 profit on a ₦100 airtime purchase.
        </p>
        {profitLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading current configuration...
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Airtime Profit Percentage
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={airtimeProfitPercent}
                  onChange={(e) => setAirtimeProfitPercent(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex items-center gap-1 min-w-[80px]">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={airtimeProfitPercent}
                    onChange={(e) => setAirtimeProfitPercent(parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <span className="text-sm font-medium text-slate-600">%</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Current value: <span className="font-semibold text-slate-700">{airtimeProfitPercent}%</span>
                {" — "}Example: ₦100 airtime → ₦{(airtimeProfitPercent).toFixed(1)} profit
              </p>
            </div>
            {profitError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {profitError}
              </p>
            )}
            <button
              onClick={handleSaveAirtimeProfit}
              disabled={profitSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profitSaving ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : profitSaved ? (
                "✓ Saved"
              ) : (
                "Save Profit Percentage"
              )}
            </button>
          </div>
        )}
      </div>

      {/* API Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">API Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Backend API URL
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Set via NEXT_PUBLIC_API_URL environment variable
            </p>
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            {saved ? "✓ Saved" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Tenant Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Tenant Configuration</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Current Tenant</p>
              <p className="text-xs text-slate-500">demo</p>
            </div>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Active
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Database Status</p>
              <p className="text-xs text-slate-500">Connected via tenant middleware</p>
            </div>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Connected
            </span>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Clear Local Data</p>
              <p className="text-xs text-slate-500">Remove all cached data and log out</p>
            </div>
            <button
              onClick={handleClearData}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Clear & Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}