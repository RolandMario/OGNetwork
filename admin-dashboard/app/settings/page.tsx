"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

const USER_LEVELS = ['normal', 'affiliate', 'top_user', 'api_user'];

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

interface ProviderMap {
  airtime: string;
  data: string;
  cable: string;
  electricity: string;
}

const AVAILABLE_PROVIDERS = ['peyflex', 'gladtidings', 'datastation', 'geodnatech', 'all'];
const SERVICE_LABELS: Record<string, string> = {
  airtime: 'Airtime',
  data: 'Data',
  cable: 'Cable TV',
  electricity: 'Electricity',
};

// Pretty label for a provider key ("all" -> "ALL API", otherwise capitalized).
const formatProviderName = (p: string): string =>
  p === 'all' ? 'ALL API' : p.charAt(0).toUpperCase() + p.slice(1);

export default function SettingsPage() {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(API_BASE);
  const [saved, setSaved] = useState(false);

  // Airtime profit by level state
  const [airtimeProfitLevels, setAirtimeProfitLevels] = useState<Record<string, number>>({
    normal: 0,
    affiliate: 0,
    top_user: 0,
    api_user: 0,
  });
  const [profitLoading, setProfitLoading] = useState(true);
  const [profitSaving, setProfitSaving] = useState(false);
  const [profitSaved, setProfitSaved] = useState(false);
  const [profitError, setProfitError] = useState<string | null>(null);

  // Service commission % by service (1–10%)
  const [commissionRates, setCommissionRates] = useState<Record<string, number>>({
    airtime: 0,
    data: 0,
    cable: 0,
    electricity: 0,
  });
  const [commissionLoading, setCommissionLoading] = useState(true);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionSaved, setCommissionSaved] = useState(false);
  const [commissionError, setCommissionError] = useState<string | null>(null);

  // Provider config state
  const [providerMap, setProviderMap] = useState<ProviderMap>({
    airtime: 'peyflex',
    data: 'peyflex',
    cable: 'peyflex',
    electricity: 'peyflex',
  });
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

  // Admin Login Security state
  const [profileLoading, setProfileLoading] = useState(true);
  const [adminProfile, setAdminProfile] = useState<any>(null);

  // Credential change state (single "Change Credentials" flow)
  const [credStep, setCredStep] = useState<'idle' | 'otp-sent' | 'done'>('idle');
  const [credSending, setCredSending] = useState(false);
  const [credOtp, setCredOtp] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [credUpdating, setCredUpdating] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchAirtimeProfitConfig();
    fetchProviderConfig();
    fetchCommissionConfig();
    fetchAdminProfile();
  }, []);

  const fetchCommissionConfig = async () => {
    try {
      setCommissionLoading(true);
      const data = await fetchWithAuth("/admin/config/commission");
      setCommissionRates(data.data.commissionRates || {
        airtime: 0,
        data: 0,
        cable: 0,
        electricity: 0,
      });
    } catch (err: any) {
      setCommissionError(err.message);
    } finally {
      setCommissionLoading(false);
    }
  };

  const handleSaveCommission = async () => {
    try {
      setCommissionSaving(true);
      setCommissionError(null);
      await fetchWithAuth("/admin/config/commission", {
        method: "PATCH",
        body: JSON.stringify({ commissionRates }),
      });
      setCommissionSaved(true);
      setTimeout(() => setCommissionSaved(false), 3000);
    } catch (err: any) {
      setCommissionError(err.message);
    } finally {
      setCommissionSaving(false);
    }
  };

  const fetchAirtimeProfitConfig = async () => {
    try {
      setProfitLoading(true);
      const data = await fetchWithAuth("/admin/config/airtime-profit");
      setAirtimeProfitLevels(data.data.profitLevels || {
        normal: 0,
        affiliate: 0,
        top_user: 0,
        api_user: 0,
      });
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
        body: JSON.stringify({ profitLevels: airtimeProfitLevels }),
      });
      setProfitSaved(true);
      setTimeout(() => setProfitSaved(false), 3000);
    } catch (err: any) {
      setProfitError(err.message);
    } finally {
      setProfitSaving(false);
    }
  };

  const fetchProviderConfig = async () => {
    try {
      setProviderLoading(true);
      const data = await fetchWithAuth("/admin/config/providers");
      setProviderMap(data.data.providerMap);
    } catch (err: any) {
      setProviderError(err.message);
    } finally {
      setProviderLoading(false);
    }
  };

  const handleProviderChange = (service: string, provider: string) => {
    setProviderMap(prev => ({ ...prev, [service]: provider }));
  };

  const handleSaveProviderConfig = async () => {
    try {
      setProviderSaving(true);
      setProviderError(null);
      await fetchWithAuth("/admin/config/providers", {
        method: "PATCH",
        body: JSON.stringify(providerMap),
      });
      setProviderSaved(true);
      setTimeout(() => setProviderSaved(false), 3000);
    } catch (err: any) {
      setProviderError(err.message);
    } finally {
      setProviderSaving(false);
    }
  };

  const handleResetProviders = async () => {
    if (!confirm("Reset all provider mappings to defaults (all peyflex)?")) return;
    try {
      setProviderSaving(true);
      setProviderError(null);
      const data = await fetchWithAuth("/admin/config/providers", {
        method: "DELETE",
      });
      setProviderMap(data.data.providerMap);
      setProviderSaved(true);
      setTimeout(() => setProviderSaved(false), 3000);
    } catch (err: any) {
      setProviderError(err.message);
    } finally {
      setProviderSaving(false);
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

// ---------------------------------------------------------------------------
  // Admin Login Security handlers
  // ---------------------------------------------------------------------------

  const fetchAdminProfile = async () => {
    try {
      setProfileLoading(true);
      const data = await fetchWithAuth("/admin/profile");
      setAdminProfile(data.data.user);
    } catch (err: any) {
      console.error("Failed to fetch admin profile:", err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSendCredOtp = async () => {
    try {
      setCredSending(true);
      setCredError(null);
      await fetchWithAuth("/admin/send-otp", {
        method: "POST",
        body: JSON.stringify({ action: "change_credentials" }),
      });
      setCredOtp("");
      setCredStep("otp-sent");
    } catch (err: any) {
      setCredError(err.message);
    } finally {
      setCredSending(false);
    }
  };

  const handleChangeCredentials = async () => {
    if (!credOtp || credOtp.length < 6) {
      setCredError("Please enter the 6-digit OTP code sent to your current email.");
      return;
    }
    if (!newEmail.trim() && !(currentPassword && newPassword)) {
      setCredError("Provide a new email and/or a new password (with your current password).");
      return;
    }
    try {
      setCredUpdating(true);
      setCredError(null);
      const payload: Record<string, any> = { otp: credOtp };
      if (newEmail.trim()) payload.newEmail = newEmail.trim();
      if (currentPassword) payload.currentPassword = currentPassword;
      if (newPassword) payload.newPassword = newPassword;
      const data = await fetchWithAuth("/admin/change-credentials", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCredStep("done");
      setAdminProfile(data.data.user);
    } catch (err: any) {
      setCredError(err.message);
    } finally {
      setCredUpdating(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your admin panel</p>
      </div>

      {/* Provider Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Provider Configuration</h2>
        <p className="text-sm text-slate-500 mb-4">
          Choose which VTU provider handles each service type. API keys are managed via <code className="bg-slate-100 px-1 rounded">.env</code> file.
        </p>

        {providerLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading provider configuration...
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(providerMap).map(([service, currentProvider]) => (
              <div key={service} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
                <label className="text-sm font-medium text-slate-700">
                  {SERVICE_LABELS[service] || service}
                </label>
                <select
                  value={currentProvider}
                  onChange={(e) => handleProviderChange(service, e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  {AVAILABLE_PROVIDERS.map(p => (
                    <option key={p} value={p}>
                      {formatProviderName(p)}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {providerError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {providerError}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveProviderConfig}
                disabled={providerSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {providerSaving ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : providerSaved ? (
                  "✓ Saved"
                ) : (
                  "Save Provider Configuration"
                )}
              </button>
              <button
                onClick={handleResetProviders}
                disabled={providerSaving}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Airtime Profit by Level Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Airtime Profit by User Level</h2>
        <p className="text-sm text-slate-500 mb-4">
          Set the profit percentage applied to airtime purchases for each user level. For example, 2% for Normal means ₦2 profit on a ₦100 airtime purchase for normal users.
        </p>
        {profitLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading current configuration...
          </div>
        ) : (
          <div className="space-y-4">
            {USER_LEVELS.map((level) => {
              const formatLevel = level.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div key={level} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
                  <label className="text-sm font-medium text-slate-700 w-32">
                    {formatLevel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={airtimeProfitLevels[level] || 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setAirtimeProfitLevels(prev => ({ ...prev, [level]: val }));
                      }}
                      className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={airtimeProfitLevels[level] || 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setAirtimeProfitLevels(prev => ({ ...prev, [level]: val }));
                      }}
                      className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-sm font-medium text-slate-600">%</span>
                  </div>
                </div>
              );
            })}
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
                "Save Profit Levels"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Service Commission by Service */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Service Commission (Members Cashback)</h2>
        <p className="text-sm text-slate-500 mb-4">
          Set the percentage of every purchase that is paid back to the member's commission wallet (range 1–10%, 0 disables it for that service). This is based on the amount the member was debited.
        </p>
        {commissionLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading commission configuration...
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(commissionRates).map((service) => (
              <div key={service} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
                <label className="text-sm font-medium text-slate-700 w-32">
                  {SERVICE_LABELS[service] || service}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={commissionRates[service] || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCommissionRates(prev => ({ ...prev, [service]: val }));
                    }}
                    className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={commissionRates[service] || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setCommissionRates(prev => ({ ...prev, [service]: val }));
                    }}
                    className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <span className="text-sm font-medium text-slate-600">%</span>
                </div>
              </div>
            ))}
            {commissionError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {commissionError}
              </p>
            )}
            <button
              onClick={handleSaveCommission}
              disabled={commissionSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {commissionSaving ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : commissionSaved ? (
                "✓ Saved"
              ) : (
                "Save Commission Rates"
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

{/* Admin Login Security (OTP-based 2FA) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">🔐 Admin Login Security</h2>
        <p className="text-sm text-slate-500 mb-4">
          Update your admin login credentials. For security, a one-time passcode (OTP) will be sent to your current email for verification.
        </p>

        {/* Admin Profile Info */}
        {profileLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4 p-3 bg-slate-50 rounded-lg">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading profile...
          </div>
        ) : (
          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {adminProfile?.fullName?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{adminProfile?.fullName || 'Admin'}</p>
              <p className="text-xs text-slate-500">{adminProfile?.email || '—'}</p>
            </div>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 capitalize">
              {adminProfile?.role || 'admin'}
            </span>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-4">
          {/* Change Credentials (single OTP-verified flow) */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Change Credentials</h3>
            <p className="text-xs text-slate-500 mb-3">
              Current email: <span className="font-medium text-slate-700">{adminProfile?.email || '—'}</span>
            </p>

            {credStep === 'idle' && (
              <button
                onClick={handleSendCredOtp}
                disabled={credSending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {credSending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending OTP...
                  </span>
                ) : (
                  'Change Credentials'
                )}
              </button>
            )}

            {credStep === 'otp-sent' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Enter OTP Code</label>
                  <input
                    type="text"
                    value={credOtp}
                    onChange={(e) => setCredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-lg text-center font-bold tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    A 6-digit code has been sent to your current email. It expires in 10 minutes.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New Email Address (optional)</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="newadmin@example.com"
                    className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank to keep your current email.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Current Password (required to change password)</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New Password (optional)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank to keep your current password.</p>
                </div>
                {credError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{credError}</p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleChangeCredentials}
                    disabled={credUpdating || !credOtp || credOtp.length < 6 || (!newEmail && !(currentPassword && newPassword))}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {credUpdating ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Verifying & Updating...
                      </span>
                    ) : (
                      'Verify OTP & Update Credentials'
                    )}
                  </button>
                  <button
                    onClick={() => { setCredStep('idle'); setCredOtp(''); setNewEmail(''); setCurrentPassword(''); setNewPassword(''); setCredError(null); }}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {credStep === 'done' && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <p className="text-sm text-green-700 font-medium">✓ Credentials updated successfully!</p>
                <p className="text-xs text-green-600 mt-1">Your admin email and/or password have been changed.</p>
              </div>
            )}
          </div>
          
        </div>
      </div>

      {/* Danger Zone */}
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