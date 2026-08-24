"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api/v1";

interface UserInfo {
  _id: string;
  fullName?: string;
  email?: string;
  phone?: string;
}

interface Transaction {
  _id: string;
  transactionReference: string;
  type: string;
  amount: number;
  status: string;
  user: UserInfo | string;
  details?: any;
  transactionId?: string;
  createdAt: string;
  updatedAt?: string;
  previousBalance?: number;
  newBalance?: number;
  providerRef?: string;
  paymentGatewayRef?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Receipt helpers (shared formatting for the admin receipt modal)
// ---------------------------------------------------------------------------
function formatNaira(amountKobo?: number) {
  const value = Number(amountKobo || 0) / 100;
  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoStr?: string) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Pretty network label for airtime/data: 'mtn' → 'MTN', '9mobile' → '9mobile'.
function formatNetworkLabel(network?: string) {
  const n = String(network || "").toLowerCase();
  if (n === "mtn") return "MTN";
  if (n === "glo") return "GLO";
  if (n === "airtel") return "Airtel";
  if (n === "9mobile") return "9mobile";
  if (!n) return "—";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Pretty cable provider label: 'dstv' → 'DSTV', 'gotv' → 'GOtv', 'startime(s)' → 'StarTimes'. */
function formatCableProviderLabel(provider?: string) {
  const p = String(provider || "").toLowerCase();
  if (p.startsWith("dstv")) return "DSTV";
  if (p.startsWith("gotv")) return "GOtv";
  if (p.startsWith("startime")) return "StarTimes";
  if (!p) return "—";
  return p.toUpperCase();
}

function getUser(tx: Transaction): UserInfo {
  if (tx.user && typeof tx.user === "object" && "_id" in tx.user) {
    const u = tx.user as UserInfo;
    return { _id: u._id, fullName: u.fullName, email: u.email, phone: u.phone };
  }
  return {} as UserInfo;
}

function serviceLabel(type?: string) {
  switch (type) {
    case "AIRTIME": return "Airtime";
    case "DATA": return "Data Bundle";
    case "CABLE": return "Cable TV";
    case "ELECTRICITY": return "Electricity";
    case "FUNDING":
    case "MANUAL_FUNDING": return "Wallet Funding";
    case "COMMISSION": return "Commission";
    case "COMMISSION_WITHDRAWAL": return "Commission Withdrawal";
    case "ADMIN_CREDIT": return "Admin Credit";
    case "ADMIN_DEBIT": return "Admin Debit";
    default: return type || "Transaction";
  }
}

function receiptTitle(tx: Transaction) {
  const d = tx.details || {};
  switch (tx.type) {
    case "AIRTIME": return `${String(d.network || "").toUpperCase()} Airtime — ${d.beneficiary || ""}`;
    case "DATA": return `${d.planName || d.planId || "Data Bundle"} — ${d.beneficiary || ""}`;
    case "CABLE": return `${d.planName || d.planId || "Cable TV"} — IUC ${d.beneficiary || ""}`;
    case "ELECTRICITY": return `${d.planName || "Electricity"} — Meter ${d.beneficiary || ""}`;
    case "FUNDING":
    case "MANUAL_FUNDING": return "Wallet Funding";
    case "COMMISSION": return `Commission — ${d.service || "Service"} purchase`;
    case "COMMISSION_WITHDRAWAL": return "Commission Withdrawn to Wallet";
    default: return tx.type || "Transaction";
  }
}

function buildRows(tx: Transaction) {
  const rows: { label: string; value: string }[] = [];
  const d = tx.details || {};
  const u = getUser(tx);
  const customer = [u.fullName, u.phone, u.email].filter(Boolean).join(" • ") || "—";

  rows.push({ label: "Customer", value: customer });
  rows.push({ label: "Date & Time", value: formatDate(tx.createdAt) });

  // For a purchased plan the leading row shows the plan's network/provider
  // (e.g. "Network: MTN") instead of a generic service category, matching the
  // mobile app receipt. Financial entries keep the generic label.
  if (tx.type === "AIRTIME" || tx.type === "DATA") {
    rows.push({ label: "Network", value: formatNetworkLabel(d.network) });
  } else if (tx.type === "CABLE") {
    rows.push({ label: "Provider", value: formatCableProviderLabel(d.network || d.cableProvider) });
  } else if (tx.type === "ELECTRICITY") {
    rows.push({ label: "Provider", value: d.planName || (d.network ? formatNetworkLabel(d.network) : "—") });
  } else {
    rows.push({ label: "Service", value: serviceLabel(tx.type) });
  }
  rows.push({ label: "Description", value: receiptTitle(tx) });

  if (tx.type === "AIRTIME") {
    rows.push({ label: "Phone Number", value: d.beneficiary || "—" });
  } else if (tx.type === "DATA") {
    // Plan shows the plan name (e.g. "1.0GB") — the plan's display name, never
    // the internal plan code — so admins can recognise the package at a glance.
    rows.push({ label: "Plan", value: d.planName || d.plan_name || d.planId || "—" });
    rows.push({ label: "Beneficiary", value: d.beneficiary || "—" });
  } else if (tx.type === "CABLE") {
    rows.push({ label: "Plan", value: d.planName || d.plan_name || d.planId || "—" });
    rows.push({ label: "IUC Number", value: d.beneficiary || "—" });
  } else if (tx.type === "ELECTRICITY") {
    rows.push({ label: "Plan", value: d.planName || d.plan_name || d.planId || "—" });
    rows.push({ label: "Meter Number", value: d.beneficiary || "—" });
    rows.push({ label: "Meter Type", value: String(d.meterType || "—").toUpperCase() });
    if (d.token) rows.push({ label: "Buy Token", value: d.token });
  }
  if (tx.type === "FUNDING" && d.paymentMethod) {
    rows.push({ label: "Payment Method", value: String(d.paymentMethod).replace(/_/g, " ") });
  }
  if (d.provider) rows.push({ label: "VTU Provider", value: d.provider });

  rows.push({ label: "Amount", value: formatNaira(tx.amount) });
  if (d.failureReason) rows.push({ label: "Note", value: d.failureReason });
  if (tx.newBalance != null) rows.push({ label: "Wallet Balance After", value: formatNaira(tx.newBalance) });

  rows.push({ label: "Transaction Reference", value: tx.transactionReference || "—" });
  if (tx.providerRef) rows.push({ label: "Provider Reference", value: tx.providerRef });
  if (tx.paymentGatewayRef) rows.push({ label: "Payment Reference", value: tx.paymentGatewayRef });

  return rows;
}
// ---------------------------------------------------------------------------
// Receipt modal content — also rendered to a hidden element for printing
// ---------------------------------------------------------------------------
function ReceiptView({ tx }: { tx: Transaction }) {
  const rows = buildRows(tx);
  const status = tx.status || "PENDING";
  return (
    <div className="bg-white p-6">
      <div className="text-center border-b-2 border-slate-800 pb-3">
        <div className="text-xl font-extrabold tracking-wider text-slate-900">OG NETWORK</div>
        <div className="text-[10px] tracking-[0.3em] text-slate-500 mt-0.5">VTU &amp; BILLS SERVICES</div>
        <div className="text-xs font-bold mt-2 pb-1 border-b-2 border-dashed border-slate-300 text-teal-700">
          OFFICIAL RECEIPT
        </div>
        <span
          className={`inline-block mt-2 px-3 py-0.5 rounded-full text-[11px] font-bold text-white ${
            status === "SUCCESS" ? "bg-green-600" : status === "FAILED" ? "bg-red-600" : "bg-amber-500"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className={`flex justify-between gap-4 py-1.5 text-sm ${
              idx < rows.length - 1 ? "border-b border-dashed border-slate-200" : ""
            }`}
          >
            <span className="text-slate-500 shrink-0">{r.label}</span>
            <span className="text-right font-semibold text-slate-800 break-words">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 bg-teal-50 border border-teal-200 rounded-md p-3 flex justify-between items-center">
        <span className="text-xs font-semibold text-teal-800">TOTAL</span>
        <span className="text-lg font-extrabold text-teal-700">{formatNaira(tx.amount)}</span>
      </div>
      <div className="mt-4 text-center text-[11px] text-slate-400 leading-5">
        <div className="font-semibold text-slate-500">Thank you for your patronage!</div>
        This is a system-generated receipt for transaction {tx.transactionReference}.<br />
        Generated on {formatDate(new Date().toISOString())}.
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Receipt modal state
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

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
    const u = getUser(tx);
    if (filter !== "ALL" && tx.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        tx.transactionReference?.toLowerCase().includes(s) ||
        tx.type?.toLowerCase().includes(s) ||
        u.fullName?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s)
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

  // -------------------------------------------------------------------------
  // Receipt actions
  // -------------------------------------------------------------------------
  const fetchFullTransaction = async (id: string) => {
    try {
      const token = localStorage.getItem("adminToken");
      const tenantId = localStorage.getItem("tenantId") || "demo";
      const res = await fetch(`${API_BASE}/admin/transactions/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
        },
      });
      if (!res.ok) throw new Error("Failed to load transaction");
      const data = await res.json();
      return data.data?.transaction as Transaction;
    } catch (err: any) {
      console.error("fetchFullTransaction error:", err);
      return null;
    }
  };

  const openReceipt = async (tx: Transaction) => {
    setReceiptLoading(true);
    const full = await fetchFullTransaction(tx._id);
    setSelectedTx(full || tx);
    setReceiptLoading(false);
  };

  const closeReceipt = () => setSelectedTx(null);

  const downloadTxt = () => {
    if (!selectedTx) return;
    const rows = buildRows(selectedTx);
    const u = getUser(selectedTx);
    const customer = [u.fullName, u.phone, u.email].filter(Boolean).join(" • ") || "—";
    const lines = [
      "========================================",
      "        OG NETWORK - OFFICIAL RECEIPT",
      "========================================",
      `Receipt Date: ${formatDate(selectedTx.createdAt)}`,
      `Status: ${selectedTx.status}`,
      "",
      `Customer: ${customer}`,
      "",
      ...rows.filter((r) => r.label !== "Customer").map((r) => `${r.label}: ${r.value}`),
      "----------------------------------------",
      `TOTAL: ${formatNaira(selectedTx.amount)}`,
      "========================================",
      "This is a system-generated receipt.",
      "Thank you for your patronage!",
      "========================================",
      "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OGNetwork-Receipt-${selectedTx.transactionReference || selectedTx._id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printReceipt = () => {
    if (!selectedTx || typeof window === "undefined") return;
    const w = window.open("", "_blank", "width=600,height=900");
    if (!w) {
      alert("Please allow pop-ups to print the receipt.");
      return;
    }
    const html = buildReceiptHtmlString(selectedTx);
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const buildReceiptHtmlString = (tx: Transaction | null) => {
    if (!tx) return "";
    const rows = buildRows(tx);
    const u = getUser(tx);
    const customer = [u.fullName, u.phone, u.email].filter(Boolean).join(" • ") || "—";
    const status = tx.status || "PENDING";
    const statusColor =
      status === "SUCCESS" ? "#10B981" : status === "FAILED" ? "#EF4444" : "#F59E0B";
    const esc = (v: any) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const rowsHtml = rows
      .filter((r) => r.label !== "Customer")
      .map(
        (r) =>
          `<div class="row"><span class="label">${esc(r.label)}</span><span class="value">${esc(
            r.value
          )}</span></div>`
      )
      .join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; background:#fff; color:#1a202c; font-size: 13px; padding: 24px; }
        .receipt { max-width: 440px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .header { background: #0a2540; color: #fff; text-align: center; padding: 24px 16px; }
        .header .brand { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
        .header .tagline { font-size: 10px; letter-spacing: 3px; color: #9cc7e8; margin-top: 4px; }
        .header .title { color: #00c897; font-size: 12px; font-weight: 700; letter-spacing: 2px; margin-top: 12px; }
        .status { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 12px; color: #fff; font-weight: 700; font-size: 11px; background: ${statusColor}; }
        .body { padding: 16px; }
        .customer { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-size: 12px; color: #475569; font-weight: 600; }
        .row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px dashed #e2e8f0; }
        .row .label { color: #718096; flex-shrink: 0; }
        .row .value { text-align: right; font-weight: 600; word-break: break-word; }
        .total { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 12px; background: #f0fdfa; border: 1px solid #a7f3d0; border-radius: 8px; }
        .total .t-label { font-size: 12px; font-weight: 600; color: #065f46; }
        .total .t-value { font-size: 18px; font-weight: 800; color: #047857; }
        .footer { text-align: center; padding: 16px; font-size: 10px; color: #94a3b8; line-height: 1.6; }
      </style></head><body>
      <div class="receipt">
        <div class="header">
          <div class="brand">OG NETWORK</div>
          <div class="tagline">VTU &amp; BILLS SERVICES</div>
          <div class="title">OFFICIAL RECEIPT</div>
          <span class="status">${esc(status)}</span>
        </div>
        <div class="customer">${esc(customer)}</div>
        <div class="body">${rowsHtml}
          <div class="total"><span class="t-label">TOTAL</span><span class="t-value">${esc(
            formatNaira(tx.amount)
          )}</span></div>
        </div>
        <div class="footer">
          <div style="font-weight:600;color:#64748b">Thank you for your patronage!</div>
          System-generated receipt for ${esc(tx.transactionReference || "")}<br/>
          Generated on ${formatDate(new Date().toISOString())}
        </div>
      </div>
    </body></html>`;
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
                  <th className="px-5 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-500">No transactions found</td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const u = getUser(tx);
                    return (
                      <tr
                        key={tx._id}
                        onClick={() => openReceipt(tx)}
                        className="text-sm text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 font-mono text-xs">{tx.transactionReference || "—"}</td>
                        <td className="px-5 py-3">
                          <div className="font-medium">{u.fullName || "Unknown"}</div>
                          <div className="text-xs text-slate-400">{u.email || ""}</div>
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
                        <td className="px-5 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openReceipt(tx);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 text-xs font-semibold transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto p-4 sm:p-8"
          onClick={closeReceipt}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Transaction Receipt</h3>
                <p className="text-xs text-slate-500">{selectedTx._id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadTxt}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-semibold transition-colors"
                  title="Download receipt as a text file"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  TXT
                </button>
                <button
                  onClick={printReceipt}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold transition-colors"
                  title="Print the receipt"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={closeReceipt}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
              {receiptLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <ReceiptView tx={selectedTx} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}