import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, Sel, StatCard } from "@/components/common";
import { useDoctors } from "@/pages/Patients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, AlertTriangle, BedDouble } from "lucide-react";

const BED_COLORS = { available: "border-emerald-300 bg-emerald-50", occupied: "border-red-300 bg-red-50",
  cleaning: "border-amber-300 bg-amber-50", reserved: "border-blue-300 bg-blue-50",
  maintenance: "border-slate-300 bg-slate-100", blocked: "border-slate-400 bg-slate-200" };

export default function IPD() {
  const [data, setData] = useState(null);
  const load = () => api.get("/ipd/console").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;
  const { beds, stats } = data;

  return (
    <div>
      <PageHeader title="IPD Console" subtitle="Room-wise bed occupancy & admissions">
        <AdmitDialog beds={beds.filter((b) => (b.bed_status || "available") === "available")} onDone={load} />
      </PageHeader>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} /><StatCard label="Occupied" value={stats.occupied} accent="red" />
        <StatCard label="Available" value={stats.available} accent="green" /><StatCard label="Cleaning" value={stats.cleaning} accent="amber" />
        <StatCard label="Reserved" value={stats.reserved} accent="blue" /><StatCard label="Blocked" value={stats.blocked + stats.maintenance} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {beds.map((b) => (
          <div key={b.id} data-testid={`bed-${b.name}`} className={`rounded-xl border-2 p-4 ${BED_COLORS[b.bed_status || "available"]}`}>
            <div className="flex justify-between items-start">
              <BedDouble size={18} className="text-slate-500" />
              <Badge variant="outline" className="text-[10px] capitalize bg-white/60">{b.bed_status || "available"}</Badge>
            </div>
            <div className="mt-2 font-mono text-sm font-semibold">{b.name}</div>
            <div className="text-xs text-slate-500">{b.room_type} · {b.ward_name}</div>
            {b.patient_name ? (
              <div className="mt-2 text-sm font-medium text-slate-800">{b.patient_name}
                <DischargeButton admissionId={b.admission_id} name={b.patient_name} onDone={load} />
              </div>
            ) : <div className="text-xs text-slate-400 mt-2">₹{b.charge}/day</div>}
          </div>
        ))}
      </div>
      {beds.length === 0 && <Empty title="No beds configured" hint="Add Wards/Rooms/Beds in Masters." />}
    </div>
  );
}

function AdmitDialog({ beds, onDone }) {
  const doctors = useDoctors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null);
  const [f, setF] = useState({});
  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const save = async () => {
    if (!sel || !f.bed_id) return toast.error("Select patient and bed");
    const bed = beds.find((b) => b.id === f.bed_id); const doc = doctors.find((d) => d.id === f.doctor_id);
    try {
      await api.post("/ipd/admissions", { patient_id: sel.id, bed_id: f.bed_id, ward_name: bed.ward_name, room_name: bed.room_name,
        bed_name: bed.name, room_charge: bed.charge, admitting_doctor: doc?.name, reason: f.reason });
      toast.success("Patient admitted · IPD number issued"); setOpen(false); setSel(null); setQ(""); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-slate-900 hover:bg-slate-800" data-testid="admit-btn"><Plus size={16} className="mr-1" />Admit / Transfer to IPD</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New IPD Admission</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Search Patient"><Input data-testid="admit-search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} /></Field>
          {results.length > 0 && <div className="border rounded-lg divide-y max-h-36 overflow-y-auto">{results.map((p) => <div key={p.id} onClick={() => { setSel(p); setQ(p.name); setResults([]); }} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name} <span className="text-xs text-slate-400 font-mono">{p.uhid}</span></div>)}</div>}
          {sel && <>
            <Field label="Bed"><Sel testId="admit-bed" value={f.bed_id} onChange={(v) => setF({ ...f, bed_id: v })} options={beds.map((b) => ({ value: b.id, label: `${b.name} · ${b.room_type} · ₹${b.charge}` }))} /></Field>
            <Field label="Admitting Doctor"><Sel value={f.doctor_id} onChange={(v) => setF({ ...f, doctor_id: v })} options={doctors.map((d) => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Reason for Admission"><Textarea value={f.reason || ""} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          </>}
        </div>
        <DialogFooter><Button onClick={save} data-testid="save-admit-btn" className="bg-slate-900" disabled={!sel}>Admit Patient</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DischargeButton({ admissionId, name, onDone }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState({});
  const save = async () => {
    try { await api.post("/ipd/discharge", { admission_id: admissionId, ...f }); toast.success("Discharged · bed released"); setOpen(false); onDone(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" className="h-6 text-[11px] text-red-600 mt-1 px-0" data-testid="discharge-btn">Discharge</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Discharge — {name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Final Condition"><Input value={f.final_condition || ""} onChange={(e) => setF({ ...f, final_condition: e.target.value })} /></Field>
          <Field label="Treatment Summary"><Textarea value={f.treatment_summary || ""} onChange={(e) => setF({ ...f, treatment_summary: e.target.value })} /></Field>
          <Field label="Follow-up Instructions"><Textarea value={f.follow_up || ""} onChange={(e) => setF({ ...f, follow_up: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button onClick={save} className="bg-slate-900">Confirm Discharge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
