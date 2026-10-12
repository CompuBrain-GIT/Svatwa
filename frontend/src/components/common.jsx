import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export function Sel({ value, onChange, options, placeholder = "Select…", testId, className = "" }) {
  return (
    <select
      data-testid={testId}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className={`flex h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const lab = typeof o === "string" ? o : o.label;
        return <option key={val} value={val}>{lab}</option>;
      })}
    </select>
  );
}

export function useOptions(mtype) {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    if (!mtype) return;
    api.get(`/options/${mtype}`).then((r) => setOpts(r.data.items.map((i) => i.name))).catch(() => {});
  }, [mtype]);
  return opts;
}

export const CUR = "₹";
export const money = (n) => `${CUR}${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const fdate = (s) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const ftime = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, accent = "slate", testId }) {
  const colors = {
    slate: "text-slate-900", teal: "text-teal-600", blue: "text-blue-600",
    amber: "text-amber-600", red: "text-red-600", green: "text-emerald-600",
  };
  return (
    <div data-testid={testId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl sm:text-3xl font-bold font-mono ${colors[accent]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="animate-spin mr-2" size={20} /> Loading…
    </div>
  );
}

export function Empty({ title = "Nothing here yet", hint }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <p className="font-medium text-slate-500">{title}</p>
      {hint && <p className="text-sm mt-1">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
