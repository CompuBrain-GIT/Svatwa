import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, Sel } from "@/components/common";
import { useDoctors } from "@/pages/Patients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ArrowRight } from "lucide-react";

const FLOW = { checked_in: "waiting", waiting: "in_consultation", in_consultation: "completed" };
const COLS = [
  { k: "checked_in", label: "Checked-in", color: "bg-blue-50 text-blue-700" },
  { k: "waiting", label: "Waiting", color: "bg-amber-50 text-amber-700" },
  { k: "in_consultation", label: "In Consultation", color: "bg-teal-50 text-teal-700" },
  { k: "completed", label: "Completed", color: "bg-emerald-50 text-emerald-700" },
];

export default function OPD() {
  const nav = useNavigate();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/visits", { params: { date: today } }); setVisits(data.items); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const advance = async (v) => {
    const next = FLOW[v.status];
    if (!next) return;
    await api.put(`/visits/${v.id}/status`, { status: next });
    toast.success(`Moved to ${next.replace("_", " ")}`); load();
  };

  return (
    <div>
      <PageHeader title="OPD Queue & Token Board" subtitle={`Live queue · ${today}`}>
        <NewVisitDialog onDone={load} />
      </PageHeader>
      {loading ? <Loading /> : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLS.map((col) => {
            const list = visits.filter((v) => v.status === col.k);
            return (
              <div key={col.k} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3" data-testid={`opd-col-${col.k}`}>
                <div className="flex justify-between items-center mb-3"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{col.label}</span><Badge variant="outline">{list.length}</Badge></div>
                <div className="space-y-2">
                  {list.map((v) => (
                    <div key={v.id} data-testid={`opd-token-${v.token}`} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                      <div className="flex justify-between items-start">
                        <div className="cursor-pointer" onClick={() => nav(`/patients/${v.patient_id}`)}>
                          <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">{v.patient_name}</div>
                          <div className="text-xs text-slate-500 font-mono">{v.uhid} · {v.doctor_name}</div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${col.color}`}>#{v.token}</span>
                      </div>
                      {v.tags?.length > 0 && <div className="flex gap-1 flex-wrap mt-1">{v.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>}
                      {FLOW[v.status] && <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-teal-600" onClick={() => advance(v)} data-testid={`advance-${v.token}`}>{FLOW[v.status].replace("_", " ")}<ArrowRight size={12} className="ml-1" /></Button>}
                    </div>
                  ))}
                  {list.length === 0 && <div className="text-xs text-slate-400 text-center py-4">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewVisitDialog({ onDone }) {
  const doctors = useDoctors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState(null);
  const [cases, setCases] = useState([]);
  const [f, setF] = useState({ duration: 15, consultation_fee: 500 });

  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const pick = async (p) => { setSel(p); setResults([]); setQ(p.name); const { data } = await api.get("/cases", { params: { patient_id: p.id } }); setCases(data.items); };

  const save = async (override = false) => {
    if (!sel) return toast.error("Select a patient");
    const doc = doctors.find((d) => d.id === f.doctor_id);
    try {
      await api.post("/visits", { patient_id: sel.id, case_id: f.case_id, doctor_id: f.doctor_id, doctor_name: doc?.name,
        reason: f.reason, duration: f.duration, consultation_fee: f.consultation_fee, override_dues: override, is_new_case: sel.new_case_alert });
      toast.success("Visit created · token issued"); setOpen(false); setSel(null); setQ(""); onDone();
    } catch (e) {
      if (e?.response?.status === 402) {
        if (window.confirm(`${apiError(e)}\n\nAuthorize override and continue?`)) return save(true);
      } else toast.error(apiError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-slate-900 hover:bg-slate-800" data-testid="new-visit-btn"><Plus size={16} className="mr-1" />New Walk-in / Visit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New OPD Visit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Search Patient (name / mobile / UHID)">
            <Input data-testid="visit-patient-search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="Type to search…" />
          </Field>
          {results.length > 0 && (
            <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
              {results.map((p) => (
                <div key={p.id} onClick={() => pick(p)} data-testid={`visit-result-${p.uhid}`} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer flex justify-between">
                  <span>{p.name} <span className="text-slate-400 font-mono text-xs">{p.uhid}</span></span>
                  {p.new_case_alert && <Badge className="bg-red-100 text-red-700 text-[10px]">6m+ new-case</Badge>}
                </div>
              ))}
            </div>
          )}
          {sel && (
            <>
              {sel.new_case_alert && <div className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg p-2">⚠ No visit in 6+ months — treated as a new-case consultation for charging.</div>}
              <Field label="Case"><Sel value={f.case_id} onChange={(v) => setF({ ...f, case_id: v })} options={cases.map((c) => ({ value: c.id, label: `${c.case_no} · ${c.treatment_type}` }))} placeholder="(optional)" /></Field>
              <Field label="Doctor"><Sel testId="visit-doctor" value={f.doctor_id} onChange={(v) => setF({ ...f, doctor_id: v })} options={doctors.map((d) => ({ value: d.id, label: d.name }))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration (min)"><Input type="number" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></Field>
                <Field label="Consultation Fee"><Input type="number" value={f.consultation_fee} onChange={(e) => setF({ ...f, consultation_fee: e.target.value })} /></Field>
              </div>
            </>
          )}
        </div>
        <DialogFooter><Button onClick={() => save(false)} data-testid="save-visit-btn" className="bg-slate-900" disabled={!sel}>Create Visit & Issue Token</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
