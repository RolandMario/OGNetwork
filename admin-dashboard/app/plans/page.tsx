"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

interface ServicePlan {
  _id: string;
  service: string;
  provider: string;
  planCode: string;
  planName: string;
  description?: string;
  providerPrice: number;
  ourPrice: number;
  isActive: boolean;
  metadata?: any;
  createdAt: string;
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

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

      const res = await fetch(`${API_BASE}/admin/plans`, {
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
    } catch (err: any) {
      alert(err.message);
    }
  };

  // FIX: signature no longer takes an optional `service` param tied directly
  // to onClick — that caused the MouseEvent to be passed in as `service`.
  // The single backend sync endpoint (/admin/sync-plans) always syncs
  // everything (data + cable + electricity) in one call, so no per-service
  // endpoint is needed here.
  const syncPlans = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";

      const res = await fetch(`${API_BASE}/admin/plans/sync-plans`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sync failed");

      // FIX: backend now returns { created, updated, errors } instead of { synced, skipped, errors }
      const syncData = data.data || {};
      const created = syncData.created || 0;
      const updated = syncData.updated || 0;
      const errors = syncData.errors || [];

      let msg = `${created} new plans created, ${updated} existing plans updated with latest provider prices.`;
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

  const filteredPlans = serviceFilter === "ALL"
    ? plans
    : plans.filter(p => p.service === serviceFilter);

  const services = ["ALL", ...new Set(plans.map(p => p.service))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Plans</h1>
          <p className="text-sm text-slate-500 mt-1">{plans.length} total plans</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => syncPlans()}
            disabled={syncing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? "Syncing..." : "Sync from Provider"}
          </button>
          <button
            onClick={() => fetchPlans()}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Service Filter */}
      <div className="flex gap-2 flex-wrap">
        {services.map((s) => (
          <button
            key={s}
            onClick={() => setServiceFilter(s)}
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

                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <p className="text-xs text-slate-500">Provider Price</p>
                    <p className="font-medium text-slate-700">₦{plan.providerPrice.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Your Price</p>
                    <p className="font-medium text-blue-600">₦{plan.ourPrice.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Margin</p>
                    <p className="font-medium text-green-600">
                      ₦{(plan.ourPrice - plan.providerPrice).toLocaleString()}
                    </p>
                  </div>
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
                    Edit
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Edit Plan</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              updatePlan(editingPlan._id, {
                ourPrice: Number((form.elements.namedItem("ourPrice") as HTMLInputElement).value),
                isActive: (form.elements.namedItem("isActive") as HTMLInputElement).checked,
              });
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{editingPlan.planName}</label>
                <p className="text-xs text-slate-500">{editingPlan.provider} • {editingPlan.planCode}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider Price</label>
                <input
                  type="number"
                  value={editingPlan.providerPrice}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Your Price (₦)</label>
                <input
                  type="number"
                  name="ourPrice"
                  defaultValue={editingPlan.ourPrice}
                  required
                  min="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
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
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}