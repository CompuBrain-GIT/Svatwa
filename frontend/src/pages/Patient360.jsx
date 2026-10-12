import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, Sel, money, fdate, ftime } from "@/components/common";
import { useDoctors } from "@/pages/Patients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, FileText, Plus } from "lucide-react";

export default function Patient360() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [cases, setCases] = useState([]);
  const [tl, setTl] = useState([]);
  const [pres, setPres] = useState([]);
  const [summary, setSummary] = useState(null);
  const doctors = useDoctors();

  const load = async () => {
    const [pt, cs, t, pr] = await Promise.all([
      api.get(`/patients/${id}`), api.get("/cases", { params: { patient_id: id } }),
      api.get(`/patients/${id}/timeline`), api.get("/prescriptions", { params: { patient_id: id } }),
    ]);
    setP(pt.data); setCases(cs.data.items); setTl(t.data.events); setPres(pr.data.items);
  };
  useEffect(() => { load(); }, [id]);
  if (!p) return <Loading />;

  const aiSummary = async () => {
    setSummary("loading");
    try { const { data } = await api.post("/ai/patient-summary", { patient_id: id }); setSummary(data.summary); }
    catch (e) { toast.error(apiError(e)); setSummary(null); }
  };

  return (
    <div>
      <Link to="/patients" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={16} className="mr-1" />Patients</Link>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center text-xl font-bold">{p.name?.slice(0,1)}</div>
            <div>
              <h1 className="text-2xl font-head font-bold text-slate-900 dark:text-slate-100">{p.name}</h1>
              <div className="text-sm text-slate-500 font-mono">{p.uhid} · {p.age}y · {p.gender} · {p.mobile}</div>
              <div className="flex gap-2 mt-1 flex-wrap">
                {p.new_case_alert && <Badge className="bg-red-100 text-red-700 border-red-200">New-case (6m+)</Badge>}
                <Badge variant="outline">{p.insurance_type || "Non-Insurance"}</Badge>
                {p.dues > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-200">Dues {money(p.dues)}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <NewCaseDialog patientId={id} doctors={doctors} onDone={load} />
            <Button variant="outline" onClick={aiSummary} data-testid="ai-summary-btn"><Sparkles size={16} className="mr-2 text-teal-600" />AI Summary</Button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 dark:bg-teal-950/20 p-4 mb-6">
          <div className="text-sm font-semibold text-teal-800 mb-2 flex items-center gap-2"><Sparkles size={15} />AI Clinical Summary <span className="text-xs font-normal text-slate-500">(for authorized review only)</span></div>
          {summary === "loading" ? <div className="text-sm text-slate-500">Generating…</div> :
            <pre className="text-xs whitespace-pre-wrap font-sans text-slate-700 dark:text-slate-300">{summary}</pre>}
        </div>
      )}

      <Tabs defaultValue="timeline">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">Cases ({cases.length})</TabsTrigger>
          <TabsTrigger value="prescriptions" data-testid="tab-prescriptions">Prescriptions ({pres.length})</TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing">Billing</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          {tl.length === 0 ? <Empty title="No activity yet" /> : (
            <div className="space-y-2">
              {tl.map((e, i) => (
                <div key={i} className="flex gap-3 items-start rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <div className="h-2 w-2 rounded-full bg-teal-500 mt-2" />
                  <div className="flex-1">
                    <div className="flex justify-between"><span className="font-medium text-sm text-slate-800 dark:text-slate-100">{e.type}</span><span className="text-xs text-slate-400">{ftime(e.at)}</span></div>
                    <div className="text-sm text-slate-500">{e.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cases" className="mt-4 space-y-2">
          {cases.length === 0 ? <Empty title="No cases" /> : cases.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono text-sm font-semibold">{c.case_no}</div>
                  <div className="text-sm text-slate-600">{c.treatment_type} · {c.doctor_name}</div>
                  <div className="text-sm text-slate-500">Dx: {c.diagnosis || "—"} · {(c.diseases||[]).join(", ")}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline">{c.status}</Badge>
                  <NewRxDialog patient={p} caseItem={c} doctors={doctors} onDone={load} />
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="prescriptions" className="mt-4 space-y-2">
          {pres.length === 0 ? <Empty title="No prescriptions" /> : pres.map((rx) => (
            <div key={rx.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex justify-between"><span className="text-sm font-medium">{fdate(rx.created_at)} · {rx.doctor_name}</span>
                <Badge variant="outline" className={rx.dispense_status === "dispensed" ? "text-emerald-600" : "text-amber-600"}>{rx.dispense_status}</Badge></div>
              <ul className="mt-2 text-sm text-slate-600 space-y-1">
                {rx.items.map((it, i) => <li key={i}>• {it.medicine} {it.strength} — {it.dose} {it.frequency} × {it.duration}d</li>)}
              </ul>
              {rx.follow_up_date && <div className="text-xs text-teal-600 mt-2">Follow-up: {fdate(rx.follow_up_date)}</div>}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="billing" className="mt-4"><BillingSummary patientId={id} /></TabsContent>

        <TabsContent value="info" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {Object.entries({ City: p.city, State: p.state, Email: p.email, DOB: p.dob, Language: p.preferred_language,
              "Blood Group": p.blood_group, "ID Proof": `${p.id_proof_type || ""} ${p.id_proof_number || ""}`,
              Guardian: p.guardian_name, ABHA: p.abha_id, "Preferred Doctor": p.preferred_doctor }).map(([k, v]) => (
              <div key={k}><div className="text-xs text-slate-400">{k}</div><div className="text-slate-700 dark:text-slate-200">{v || "—"}</div></div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BillingSummary({ patientId }) {
  const [s, setS] = useState(null);
  useEffect(() => { api.get(`/billing/summary/${patientId}`).then((r) => setS(r.data)).catch(() => {}); }, [patientId]);
  if (!s) return <Loading />;
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border p-3"><div className="text-xs text-slate-400">Billed</div><div className="font-mono font-bold">{money(s.billed)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-slate-400">Received</div><div className="font-mono font-bold text-emerald-600">{money(s.received)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-slate-400">Discount</div><div className="font-mono font-bold">{money(s.discount)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-slate-400">Outstanding</div><div className="font-mono font-bold text-red-600">{money(s.outstanding)}</div></div>
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Charges</div>
      {s.charges.length === 0 ? <Empty title="No charges" /> : (
        <div className="space-y-1">{s.charges.map((c) => (
          <div key={c.id} className="flex justify-between text-sm border-b border-slate-100 py-2"><span>{c.service} <span className="text-slate-400">· {fdate(c.created_at)}</span></span><span className="font-mono">{money(c.net)}</span></div>
        ))}</div>
      )}
    </div>
  );
}

function NewCaseDialog({ patientId, doctors, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ treatment_type: "Consulting", status: "Active" });
  const save = async () => {
    try {
      const doc = doctors.find((d) => d.id === f.doctor_id);
      await api.post("/cases", { ...f, patient_id: patientId, doctor_name: doc?.name });
      toast.success("Case created"); setOpen(false); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-slate-900 hover:bg-slate-800" data-testid="new-case-btn"><Plus size={16} className="mr-1" />New Case</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Treatment Case</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Treatment Type"><Sel value={f.treatment_type} onChange={(v) => setF({ ...f, treatment_type: v })} options={["Consulting","Therapy","Counseling","EPT","Other"]} /></Field>
          <Field label="Doctor"><Sel value={f.doctor_id} onChange={(v) => setF({ ...f, doctor_id: v })} options={doctors.map((d) => ({ value: d.id, label: d.name }))} /></Field>
          <Field label="Diagnosis"><Input value={f.diagnosis || ""} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} /></Field>
          <Field label="Chief Complaint"><Textarea value={f.complaint || ""} onChange={(e) => setF({ ...f, complaint: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button onClick={save} data-testid="save-case-btn" className="bg-slate-900">Create Case</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewRxDialog({ patient, caseItem, doctors, onDone }) {
  const [open, setOpen] = useState(false);
  const [meds, setMeds] = useState([]);
  const [items, setItems] = useState([{ medicine: "", strength: "", dose: "1-0-1", frequency: "Daily", route: "Oral", duration: 30, instructions: "" }]);
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) api.get("/medicines").then((r) => setMeds(r.data.items)); }, [open]);
  useEffect(() => {
    if (open) api.get(`/prescriptions/previous/${patient.id}`).then((r) => {
      if (r.data.prescription) { setItems(r.data.prescription.items); toast.info("Previous prescription loaded — review & edit"); }
    });
  }, [open, patient.id]);

  const setItem = (i, k, v) => setItems((s) => s.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const save = async () => {
    const valid = items.filter((it) => it.medicine);
    if (!valid.length) return toast.error("Add at least one medicine");
    try {
      await api.post("/prescriptions", { patient_id: patient.id, patient_name: patient.name, case_id: caseItem.id,
        doctor_id: caseItem.doctor_id, doctor_name: caseItem.doctor_name, items: valid, notes, status: "confirmed" });
      toast.success("Prescription confirmed → sent to pharmacy"); setOpen(false); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" data-testid="new-rx-btn"><FileText size={14} className="mr-1" />Prescribe</Button></DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Digital Prescription — {patient.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border-b border-slate-100 pb-3">
              <div className="col-span-2"><Field label="Medicine"><Sel value={it.medicine} onChange={(v) => { const m = meds.find((x) => x.name === v); setItem(i, "medicine", v); if (m) setItem(i, "strength", m.strength); }} options={meds.map((m) => m.name)} /></Field></div>
              <Field label="Strength"><Input value={it.strength} onChange={(e) => setItem(i, "strength", e.target.value)} /></Field>
              <Field label="Dose"><Input value={it.dose} onChange={(e) => setItem(i, "dose", e.target.value)} /></Field>
              <Field label="Freq"><Input value={it.frequency} onChange={(e) => setItem(i, "frequency", e.target.value)} /></Field>
              <Field label="Days"><Input type="number" value={it.duration} onChange={(e) => setItem(i, "duration", e.target.value)} /></Field>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { medicine: "", strength: "", dose: "1-0-1", frequency: "Daily", route: "Oral", duration: 30 }])}><Plus size={14} className="mr-1" />Add medicine</Button>
          <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter><Button onClick={save} data-testid="save-rx-btn" className="bg-slate-900">Confirm Prescription</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
