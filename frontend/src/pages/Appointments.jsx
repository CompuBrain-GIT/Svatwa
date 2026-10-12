import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, Sel, fdate } from "@/components/common";
import { useDoctors } from "@/pages/Patients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Appointments() {
  const doctors = useDoctors();
  const [items, setItems] = useState([]);
  const load = () => api.get("/appointments").then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  const grouped = items.reduce((acc, a) => { (acc[a.date] = acc[a.date] || []).push(a); return acc; }, {});

  return (
    <div>
      <PageHeader title="Appointments & Calendar" subtitle="Consultations, follow-ups, therapy & reviews">
        <NewAppt doctors={doctors} onDone={load} />
      </PageHeader>
      {items.length === 0 ? <Empty title="No appointments scheduled" /> : (
        <div className="space-y-5">
          {Object.entries(grouped).sort().map(([date, list]) => (
            <div key={date}>
              <div className="text-sm font-semibold text-slate-600 mb-2">{fdate(date)}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.sort((a, b) => (a.time || "").localeCompare(b.time || "")).map((a) => (
                  <div key={a.id} className="rounded-lg border bg-white dark:bg-slate-900 p-3" data-testid={`appt-${a.id}`}>
                    <div className="flex justify-between"><span className="font-medium text-sm">{a.patient_name}</span><Badge variant="outline">{a.time || "—"}</Badge></div>
                    <div className="text-xs text-slate-500">{a.type} · {a.doctor_name}</div>
                    <Badge variant="outline" className="mt-1 text-[10px] capitalize">{a.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAppt({ doctors, onDone }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null);
  const [f, setF] = useState({ type: "Consultation", duration: 15, date: new Date().toISOString().slice(0, 10) });
  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const save = async () => {
    if (!sel) return toast.error("Select patient");
    const doc = doctors.find((d) => d.id === f.doctor_id);
    try { await api.post("/appointments", { ...f, patient_id: sel.id, patient_name: sel.name, doctor_name: doc?.name }); toast.success("Appointment booked"); setOpen(false); setSel(null); setQ(""); onDone(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-slate-900" data-testid="new-appt-btn"><Plus size={16} className="mr-1" />New Appointment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Book Appointment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Patient"><Input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} data-testid="appt-search" /></Field>
          {results.length > 0 && <div className="border rounded-lg divide-y max-h-36 overflow-y-auto">{results.map((p) => <div key={p.id} onClick={() => { setSel(p); setQ(p.name); setResults([]); }} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name}</div>)}</div>}
          <Field label="Doctor"><Sel value={f.doctor_id} onChange={(v) => setF({ ...f, doctor_id: v })} options={doctors.map((d) => ({ value: d.id, label: d.name }))} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Time"><Input type="time" value={f.time || ""} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          </div>
          <Field label="Type"><Sel value={f.type} onChange={(v) => setF({ ...f, type: v })} options={["Consultation", "Follow-up", "Therapy", "Counselling", "Review"]} /></Field>
        </div>
        <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-appt-btn" disabled={!sel}>Book</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
