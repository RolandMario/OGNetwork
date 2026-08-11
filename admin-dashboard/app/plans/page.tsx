"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

const USER_LEVELS = ['normal', 'affiliate', 'top_user', 'api_user'];

// Canonical data networks + preferred display ordering for the Network filter.
const NETWORK_ORDER = ['mtn', 'airtel', 'glo', '9mobile'];

// Preferred ordering for the plan-type filter chips.
const PLAN_TYPE_ORDER = ['Regular', 'Gifting', 'Corporate Gifting', 'Corporate', 'Awoof', 'SME', 'Data Share', 'Special', 'Talkmore', 'Night'];

// Map any provider identifier to its canonical network.
function getNetworkFromProvider(provider: string): string {
  const p = String(provider || '').toLowerCase();
  if (p.includes('mtn')) return 'mtn';
  if (p.includes('airtel')) return 'airtel';
  if (p.includes('glo')) return 'glo';
  if (p.includes('9mobile') || p.includes('etisalat')) return '9mobile';
  return 'other';
}

// Pretty-print a network identifier for the filter chips.
function formatNetworkName(network: string): string {
  const n = String(network || '').toLowerCase();
  if (n === 'mtn') return 'MTN';
  if (n === 'airtel') return 'Airtel';
  if (n === 'glo') return 'GLO';
  if (n === '9mobile') return '9mobile';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// Derive the plan type (Gifting, Corporate Gifting, SME, Special, Data Share,
// Awoof, Talkmore, ...) for a data plan. Prefers the structured plan_type stored
// in metadata by the sync, then falls back to parsing the provider id + plan text.
function getPlanType(plan: ServicePlan): string {
  // 1. Structured plan type from the provider (metadata.plan_type)
  const rawType = String(plan.metadata?.plan_type || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (rawType) {
    if (rawType.includes('corporate gifting')) return 'Corporate Gifting';
    if (rawType.includes('data share')) return 'Data Share';
    if (rawType.includes('awoof')) return 'Awoof';
    if (rawType.includes('talkmore')) return 'Talkmore';
    if (rawType.startsWith('sme')) return 'SME'; // SME, SME2, SME3, ...
    if (rawType.includes('corporate')) return 'Corporate';
    if (rawType.includes('gifting') || rawType.includes('gift')) return 'Gifting';
    if (rawType.includes('special')) return 'Special';
    if (rawType.includes('night')) return 'Night';
    return 'Regular';
  }

  // 2. Fallback: parse from provider id + plan text
  const provider = String(plan.provider || '').toLowerCase();
  const hay = [
    provider,
    plan.metadata?.description,
    plan.description,
    plan.planName,
    plan.metadata?.label,
  ].filter(Boolean).join(' ').toLowerCase();

  if (hay.includes('corporate gifting')) return 'Corporate Gifting';
  if (hay.includes('awoof')) return 'Awoof';
  if (hay.includes('talkmore')) return 'Talkmore';
  if (hay.includes('data share') || hay.includes('share')) return 'Data Share';
  if (hay.includes('corporate')) return 'Corporate';
  if (hay.includes('sme')) return 'SME';
  if (hay.includes('gifting') || hay.includes('gift')) return 'Gifting';
  if (hay.includes('special')) return 'Special';
  if (hay.includes('night')) return 'Night';
  return 'Regular';
}

// Extract the validity (in days) from a data plan. Checks in order of authority:
//  1. plan.metadata            (provider-reported, e.g. "GIFTING - 30")
//  2. plan.description         (mirrors the metadata description)
//  3. plan.planName            (display label, only explicit unit patterns)
function getDurationDays(plan: ServicePlan): number | null {
  const meta = plan.metadata || {};
  const metaText = [meta.validity, meta.month_validate, meta.description]
    .filter((v: any) => v != null && v !== '').join(' ').toLowerCase();
  const descText = String(plan.description || '').toLowerCase();
  const nameText = String(plan.planName || '').toLowerCase();

  // Word numbers -> digits (incl. the "0ne week" typo some providers use)
  const WORD_NUMBERS: Record<string, number> = { one: 1, '0ne': 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

  const parseText = (text: string): number | null => {
    if (!text || !text.trim()) return null;
    let t = text.toLowerCase();
    for (const [word, num] of Object.entries(WORD_NUMBERS)) {
      t = t.split(word).join(String(num));
    }

    // Explicit "N day(s)/week(s)/month(s)/year(s)" — e.g. "30days", "7 days", "2 DAYS"
    const m = t.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|weeks?|wks?|days?)/);
    if (m) {
      const value = parseFloat(m[1]);
      const unit = m[2].replace('.', '');
      if (unit[0] === 'y') return Math.round(value * 365);
      if (unit.startsWith('month')) return Math.round(value * 30);
      if (unit[0] === 'w') return Math.round(value * 7);
      return Math.round(value);
    }

    // Cadence words
    if (/\bdaily\b|\b1 ?day\b|\bnightly\b|\btoday\b/.test(t)) return 1;
    if (/\bweekly\b|\b7 ?days?\b/.test(t)) return 7;
    if (/\bmonthly\b|\b30 ?days?\b|\ba month\b|\bmonth\b/.test(t)) return 30;
    if (/\byearly\b|\bannually\b|\b365 ?days?\b/.test(t)) return 365;

    // Bare numbers (validity), skipping GB/MB/TB size tokens e.g. "GIFTING - 30"
    const cleaned = t.replace(/\d+(?:\.\d+)?\s*(gb|mb|tb|kb)\b/g, ' ');
    const nums = (cleaned.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= 3650);
    if (nums.length) return Math.max(...nums);
    return null;
  };

  if (metaText.trim()) {
    const fromMeta = parseText(metaText);
    if (fromMeta != null) return fromMeta;
  }
  if (descText.trim()) {
    const fromDesc = parseText(descText);
    if (fromDesc != null) return fromDesc;
  }

  // Plan name only counts when it carries an explicit unit ("30 Days", "1 Month")
  const nameUnit = nameText.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|weeks?|days?|day)/);
  if (nameUnit) {
    const value = parseFloat(nameUnit[1]);
    const unit = nameUnit[2];
    if (unit[0] === 'y') return Math.round(value * 365);
    if (unit.startsWith('month')) return Math.round(value * 30);
    if (unit[0] === 'w') return Math.round(value * 7);
    return Math.round(value);
  }

  return null;
}

// Human-readable duration label (e.g. 7 -> "7 Days", 90 -> "3 Months").
function getDurationLabel(days: number | null): string {
  if (days == null) return 'Duration varies';
  if (days % 365 === 0 && days >= 365) return days === 365 ? '1 Year' : `${days / 365} Years`;
  if (days % 30 === 0 && days >= 30) return days === 30 ? '1 Month' : `${days / 30} Months`;
  return `${days} Day${days === 1 ? '' : 's'}`;
}

interface ServicePlan {
  _id: string;
  service: string;
  provider: string;
  planCode: string;
  planName: string;
  description?: string;
  providerPrice: number;
  ourPrice: number;
  prices?: {
    normal: number;
    affiliate: number;
    top_user: number;
    api_user: number;
  };
  isActive: boolean;
  metadata?: any;
  createdAt: string;
}

interface LevelPrices {
  normal: number;
  affiliate: number;
  top_user: number;
  api_user: number;
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [networkFilter, setNetworkFilter] = useState("ALL");
  const [planTypeFilter, setPlanTypeFilter] = useState("ALL");
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("adminToken")) {
      router.push("/login");
      return;
    }
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";

      const res = await fetch(`${API_BASE}/admin/plans?limit=5000`, {
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
      if (!res.ok) throw new Error(data.message || "Failed to fetch plans");

      setPlans(data.data?.plans || data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updatePlan = async (planId: string, updates: Partial<ServicePlan>) => {
    try {
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";

      const res = await fetch(`${API_BASE}/admin/plans/${planId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Failed to update plan");

      setPlans(plans.map(p => p._id === planId ? { ...p, ...updates } : p));
      setShowEditModal(false);
      setEditingPlan(null);
      setSaveMsg("Plan updated successfully.");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateLevelPrices = async (planId: string, prices: LevelPrices) => {
    try {
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";

      const res = await fetch(`${API_BASE}/admin/plans/${planId}/prices`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prices }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update level prices");
      }

      // Update local state with new prices
      setPlans(plans.map(p =>
        p._id === planId ? { ...p, prices: { ...p.prices, ...prices } as LevelPrices } : p
      ));
      setShowEditModal(false);
      setEditingPlan(null);
      setSaveMsg("Level prices updated successfully.");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // FIX: signature no longer takes an optional `service` param tied directly
  // to onClick — that caused the MouseEvent to be passed in as `service`.
  // The single backend sync endpoint (/admin/sync-plans) always syncs
  // everything (data + cable + electricity) in one call, so no per-service
  // endpoint is needed here.
  const syncPlans = async (service?: string) => {
    setSyncing(true);
    try {
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";

      // If a specific service is provided, use the per-service endpoint
      const endpoint = service
        ? `/admin/plans/sync/${service}`
        : "/admin/plans/sync-plans";

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sync failed");

      // Backend returns { synced, updated, skipped, errors }
      const syncData = data.data || {};
      const synced = syncData.synced || 0;
      const updated = syncData.updated || 0;
      const skipped = syncData.skipped || 0;
      const errors = syncData.errors || [];

      let msg = `${synced} new plans created, ${updated} re-tagged to active provider, ${skipped} existing plans skipped.`;
      if (errors.length > 0) {
        msg += `\n\nErrors (${errors.length}):\n${errors.slice(0, 5).join('\n')}`;
        if (errors.length > 5) msg += `\n...and ${errors.length - 5} more`;
      }
      alert(msg);
      fetchPlans();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const getLevelPrice = (plan: ServicePlan, level: string): number => {
    if (plan.prices && (plan.prices as any)[level] !== undefined) {
      return (plan.prices as any)[level];
    }
    return plan.ourPrice;
  };

  const services = ["ALL", ...new Set(plans.map(p => p.service))];

  // Data plans — used to power the Network Type + Plan Type filters below.
  const dataPlans = plans.filter(p => p.service === "data");
  const dataNetworks = Array.from(new Set(dataPlans.map(p => getNetworkFromProvider(p.provider))))
    .filter(n => n !== "other")
    .sort((a, b) => NETWORK_ORDER.indexOf(a) - NETWORK_ORDER.indexOf(b));

  const networkPlans = networkFilter === "ALL"
    ? dataPlans
    : dataPlans.filter(p => getNetworkFromProvider(p.provider) === networkFilter);

  const dataPlanTypes = Array.from(new Set(networkPlans.map(p => getPlanType(p))))
    .sort((a, b) => {
      const ai = PLAN_TYPE_ORDER.indexOf(a);
      const bi = PLAN_TYPE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  const filteredPlans = serviceFilter === "data"
    ? (planTypeFilter === "ALL"
        ? networkPlans
        : networkPlans.filter(p => getPlanType(p) === planTypeFilter))
    : serviceFilter === "ALL"
      ? plans
      : plans.filter(p => p.service === serviceFilter);

  const formatLevelName = (level: string) => {
    return level.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Plans</h1>
          <p className="text-sm text-slate-500 mt-1">
            {plans.length} total plans
            {(serviceFilter !== "ALL" || networkFilter !== "ALL" || planTypeFilter !== "ALL") && ` • ${filteredPlans.length} shown`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => syncPlans()}
            disabled={syncing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? "Syncing..." : "Sync All"}
          </button>
          <button
            onClick={() => syncPlans("data")}
            disabled={syncing}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sync Data
          </button>
          <button
            onClick={() => syncPlans("cable")}
            disabled={syncing}
            className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sync Cable
          </button>
          <button
            onClick={() => syncPlans("electricity")}
            disabled={syncing}
            className="px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sync Electricity
          </button>
          <button
            onClick={() => fetchPlans()}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
          {saveMsg}
        </div>
      )}

      {/* Service Filter */}
      <div className="flex gap-2 flex-wrap">
        {services.map((s) => (
          <button
            key={s}
            onClick={() => { setServiceFilter(s); setNetworkFilter("ALL"); setPlanTypeFilter("ALL"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              serviceFilter === s
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All Services" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Data filters: Network Type first, then Plan Type */}
      {serviceFilter === "data" && (
        <>
          {dataNetworks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Network Type</p>
              <div className="flex gap-2 flex-wrap">
                {["ALL", ...dataNetworks].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setNetworkFilter(n); setPlanTypeFilter("ALL"); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      networkFilter === n
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {n === "ALL" ? "All Networks" : formatNetworkName(n)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && networkPlans.length > 0 && dataPlanTypes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan Type</p>
              <div className="flex gap-2 flex-wrap">
                {["ALL", ...dataPlanTypes].map((t) => (
                  <button
                    key={t}
                    onClick={() => setPlanTypeFilter(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      planTypeFilter === t
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t === "ALL" ? "All Plan Types" : t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlans.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-500">No plans found</div>
          ) : (
            filteredPlans.map((plan) => (
              <div key={plan._id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{plan.planName}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{plan.provider} • {plan.planCode}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    plan.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {plan.service === "data" && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-xs text-slate-500">Duration:</span>
                    <span className="text-sm font-semibold text-slate-800">{getDurationLabel(getDurationDays(plan))}</span>
                  </div>
                )}

                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <p className="text-xs text-slate-500">Provider Price</p>
                    <p className="font-medium text-slate-700">₦{plan.providerPrice.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Normal Price</p>
                    <p className="font-medium text-blue-600">₦{getLevelPrice(plan, 'normal').toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Margin</p>
                    <p className="font-medium text-green-600">
                      ₦{(getLevelPrice(plan, 'normal') - plan.providerPrice).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Level prices summary */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {USER_LEVELS.filter(l => l !== 'normal').map(level => (
                    <div key={level} className="text-xs">
                      <span className="text-slate-500">{formatLevelName(level)}:</span>
                      <span className="ml-1 font-medium text-slate-700">
                        ₦{getLevelPrice(plan, level).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    {plan.service}
                  </span>
                  <button
                    onClick={() => {
                      setEditingPlan(plan);
                      setShowEditModal(true);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit Prices
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingPlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Edit Plan Prices</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const ourPrice = Number((form.elements.namedItem("ourPrice") as HTMLInputElement).value);
              const isActive = (form.elements.namedItem("isActive") as HTMLInputElement).checked;

              // Collect level prices
              const prices: any = {};
              for (const level of USER_LEVELS) {
                const input = form.elements.namedItem(`price_${level}`) as HTMLInputElement;
                if (input) {
                  prices[level] = Number(input.value);
                }
              }

              // Update both ourPrice and level prices
              updatePlan(editingPlan._id, { ourPrice, isActive }).then(() => {
                updateLevelPrices(editingPlan._id, prices);
              });
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{editingPlan.planName}</label>
                <p className="text-xs text-slate-500">{editingPlan.provider} • {editingPlan.planCode}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider Price (read-only)</label>
                <input
                  type="number"
                  value={editingPlan.providerPrice}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Normal Price (₦)</label>
                <input
                  type="number"
                  name="ourPrice"
                  defaultValue={getLevelPrice(editingPlan, 'normal')}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              {/* Level-specific prices */}
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Prices by User Level</h3>
                <div className="grid grid-cols-2 gap-3">
                  {USER_LEVELS.filter(l => l !== 'normal').map(level => (
                    <div key={level}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {formatLevelName(level)} (₦)
                      </label>
                      <input
                        type="number"
                        name={`price_${level}`}
                        defaultValue={getLevelPrice(editingPlan, level)}
                        required
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editingPlan.isActive}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label className="text-sm text-slate-700">Active</label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingPlan(null); }}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Save All Prices
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}