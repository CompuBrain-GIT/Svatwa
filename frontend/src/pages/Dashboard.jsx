import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatCard, Loading, money } from "@/components/common";
import { Users, ClipboardList, BedDouble, Pill, Receipt, CalendarDays } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState(null);

  useEffect(() => { api.get("/dashboard/stats").then((r) => setS(r.data)).catch(() => {}); }, []);
  if (!s) return <Loading />;

  const quick = [
    { to: "/patients", label: "Patients", icon: Users, m: "patients" },
    { to: "/opd", label: "OPD Queue", icon: ClipboardList, m: "opd" },
    { to: "/ipd", label: "IPD Console", icon: BedDouble, m: "ipd" },
    { to: "/pharmacy", label: "Pharmacy", icon: Pill, m: "pharmacy" },
    { to: "/billing", label: "Billing", icon: Receipt, m: "billing" },
    { to: "/appointments", label: "Appointments", icon: CalendarDays, m: "appointments" },
  ].filter((q) => user?.modules?.includes(q.m));

  return (
    <div>
      <PageHeader title={`Good day, ${user?.name?.split(" ")[0] || ""}`} subtitle="Live hospital overview" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard testId="stat-patients" label="Total Patients" value={s.total_patients} hint={`${s.new_today} new today`} accent="slate" />
        <StatCard testId="stat-active-cases" label="Active Cases" value={s.active_cases} accent="teal" />
        <StatCard testId="stat-opd-queue" label="OPD Queue" value={s.opd_queue} hint={`${s.todays_appointments} appts today`} accent="blue" />
        <StatCard testId="stat-admissions" label="Admitted (IPD)" value={s.admissions} accent="slate" />
        <StatCard testId="stat-beds" label="Available Beds" value={`${s.available_beds}/${s.total_beds}`} hint={`${s.occupied_beds} occupied`} accent="green" />
        <StatCard testId="stat-pharmacy" label="Pharmacy Pending" value={s.pharmacy_pending} hint={`${s.low_stock} low stock`} accent="amber" />
        <StatCard testId="stat-received" label="Received Today" value={money(s.today_received)} accent="green" />
        <StatCard testId="stat-outstanding" label="Outstanding" value={money(s.outstanding)} hint={`${money(s.total_billed)} billed`} accent="red" />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Quick access</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quick.map((q) => (
            <Link key={q.to} to={q.to} data-testid={`quick-${q.m}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-teal-400 hover:shadow-sm transition-all flex flex-col items-center gap-2 text-center">
              <q.icon className="text-teal-600" size={22} />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-teal-200 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-900 p-5">
        <div className="text-sm font-semibold text-teal-800 dark:text-teal-300">Revenue overview</div>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <div><div className="text-xs text-slate-500">Total Billed</div><div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">{money(s.total_billed)}</div></div>
          <div><div className="text-xs text-slate-500">Total Received</div><div className="text-xl font-bold font-mono text-emerald-600">{money(s.total_revenue)}</div></div>
          <div><div className="text-xs text-slate-500">Outstanding</div><div className="text-xl font-bold font-mono text-red-600">{money(s.outstanding)}</div></div>
        </div>
      </div>
    </div>
  );
}
