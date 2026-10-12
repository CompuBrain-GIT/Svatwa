import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Loading, StatCard, money } from "@/components/common";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const COLORS = ["#0D9488", "#2563EB", "#8B5CF6", "#F59E0B", "#EF4444", "#10B981"];
const toData = (obj) => Object.entries(obj || {}).map(([name, value]) => ({ name, value }));

export default function Analytics() {
  const [a, setA] = useState(null);
  useEffect(() => { api.get("/analytics").then((r) => setA(r.data)).catch(() => {}); }, []);
  if (!a) return <Loading />;

  const Chart = ({ title, children }) => (
    <div className="rounded-xl border bg-white dark:bg-slate-900 p-4"><div className="text-sm font-semibold mb-3">{title}</div><div style={{ height: 240 }}>{children}</div></div>
  );

  return (
    <div>
      <PageHeader title="Advanced Analytics" subtitle="Live figures derived from database records" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Patients" value={a.patients.total} />
        <StatCard label="New" value={a.patients.new} accent="teal" />
        <StatCard label="Returning" value={a.patients.returning} accent="blue" />
        <StatCard label="Admissions" value={a.clinical.admissions} />
        <StatCard label="Billed" value={money(a.billing.billed)} />
        <StatCard label="Received" value={money(a.billing.received)} accent="green" />
        <StatCard label="Outstanding" value={money(a.billing.outstanding)} accent="red" />
        <StatCard label="OPD Visits" value={a.clinical.opd_visits} accent="blue" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Chart title="Patients by Age Group">
          <ResponsiveContainer><BarChart data={toData(a.patients.age_distribution)}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#0D9488" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>
        </Chart>
        <Chart title="Treatment Type Distribution">
          <ResponsiveContainer><PieChart><Pie data={toData(a.clinical.treatment_distribution)} dataKey="value" nameKey="name" outerRadius={80} label>{toData(a.clinical.treatment_distribution).map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </Chart>
        <Chart title="Disease / Condition Distribution">
          <ResponsiveContainer><BarChart data={toData(a.clinical.disease_distribution)} layout="vertical"><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" fontSize={10} width={110} /><Tooltip /><Bar dataKey="value" fill="#2563EB" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>
        </Chart>
        <Chart title="Revenue by Service">
          <ResponsiveContainer><BarChart data={toData(a.billing.revenue_by_service)}><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="value" fill="#8B5CF6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>
        </Chart>
        <Chart title="Revenue by Payment Method">
          <ResponsiveContainer><PieChart><Pie data={toData(a.billing.revenue_by_method)} dataKey="value" nameKey="name" outerRadius={80} label>{toData(a.billing.revenue_by_method).map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => money(v)} /></PieChart></ResponsiveContainer>
        </Chart>
        <Chart title="Monthly Collection">
          <ResponsiveContainer><LineChart data={toData(a.billing.monthly)}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(v)} /><Line dataKey="value" stroke="#0D9488" strokeWidth={2} /></LineChart></ResponsiveContainer>
        </Chart>
      </div>
    </div>
  );
}
