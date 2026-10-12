import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, ftime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const MSE_FIELDS = ["Appearance", "Behaviour", "Speech", "Mood", "Affect", "Thought", "Perception", "Cognition", "Insight", "Judgment"];
const ASSESS = ["specific_instructions", "medical_condition", "drug_reactions", "presenting_complaint", "past_history", "family_history", "personal_history", "occupational_marital_history", "provisional_diagnosis"];
const LABELS = { specific_instructions: "Specific Instructions", medical_condition: "Medical Condition", drug_reactions: "Drug Reactions / Allergy", presenting_complaint: "Presenting Complaint", past_history: "Past History", family_history: "Family History", personal_history: "Personal History", occupational_marital_history: "Occupational / Marital History", provisional_diagnosis: "Provisional Diagnosis" };

export default function Clinical() {
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null);
  const [records, setRecords] = useState([]);
  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const pick = async (p) => { setSel(p); setResults([]); setQ(p.name); loadRecords(p.id); };
  const loadRecords = (pid) => api.get("/clinical", { params: { patient_id: pid } }).then((r) => setRecords(r.data.items));

  const saveAssessment = async (data) => { await api.post("/clinical/assessment", { patient_id: sel.id, data }); toast.success("Assessment saved"); loadRecords(sel.id); };
  const saveMSE = async (data) => { await api.post("/clinical/mse", { patient_id: sel.id, data }); toast.success("MSE saved"); loadRecords(sel.id); };
  const saveRisk = async (data) => { await api.post("/clinical/risk", { patient_id: sel.id, data }); toast.success("Risk assessment saved"); loadRecords(sel.id); };

  return (
    <div>
      <PageHeader title="Clinical Management" subtitle="Psychiatric assessment · MSE · risk & safety" />
      <div className="relative max-w-md mb-4">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} placeholder="Search patient…" data-testid="clinical-search" />
        {results.length > 0 && <div className="absolute z-10 w-full border rounded-lg bg-white divide-y max-h-48 overflow-y-auto shadow">{results.map((p) => <div key={p.id} onClick={() => pick(p)} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name} <span className="text-xs text-slate-400 font-mono">{p.uhid}</span></div>)}</div>}
      </div>
      {!sel ? <Empty title="Search a patient to start clinical documentation" /> : (
        <Tabs defaultValue="assessment">
          <TabsList><TabsTrigger value="assessment">Assessment</TabsTrigger><TabsTrigger value="mse">MSE</TabsTrigger><TabsTrigger value="risk">Risk & Safety</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
          <TabsContent value="assessment" className="mt-4"><AssessmentForm onSave={saveAssessment} /></TabsContent>
          <TabsContent value="mse" className="mt-4"><MSEForm onSave={saveMSE} /></TabsContent>
          <TabsContent value="risk" className="mt-4"><RiskForm onSave={saveRisk} /></TabsContent>
          <TabsContent value="history" className="mt-4">
            {records.length === 0 ? <Empty title="No clinical records" /> : records.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 mb-2 bg-white dark:bg-slate-900">
                <div className="flex justify-between"><span className="font-medium text-sm capitalize">{r.kind}</span><span className="text-xs text-slate-400">{ftime(r.at)} · {r.author_name}</span></div>
                <pre className="text-xs text-slate-500 whitespace-pre-wrap font-sans mt-1">{JSON.stringify(r.data, null, 1).slice(0, 400)}</pre>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AssessmentForm({ onSave }) {
  const [f, setF] = useState({});
  return (
    <div className="space-y-3">
      {ASSESS.map((k) => <Field key={k} label={LABELS[k]}><Textarea value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`assess-${k}`} /></Field>)}
      <Button onClick={() => onSave(f)} className="bg-slate-900" data-testid="save-assessment-btn">Save Assessment</Button>
    </div>
  );
}
function MSEForm({ onSave }) {
  const [f, setF] = useState({});
  return (
    <div><div className="grid sm:grid-cols-2 gap-3">{MSE_FIELDS.map((k) => <Field key={k} label={k}><Input value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
      <Button onClick={() => onSave(f)} className="bg-slate-900 mt-4" data-testid="save-mse-btn">Save MSE</Button></div>
  );
}
function RiskForm({ onSave }) {
  const [f, setF] = useState({ level: "Low" });
  return (
    <div className="space-y-3 max-w-lg">
      <Field label="Risk Level"><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className="h-10 w-full rounded-md border px-3 text-sm"><option>Low</option><option>Moderate</option><option>High</option><option>Critical</option></select></Field>
      <Field label="Self-harm / Suicidal ideation"><Textarea value={f.self_harm || ""} onChange={(e) => setF({ ...f, self_harm: e.target.value })} /></Field>
      <Field label="Risk to others / Aggression"><Textarea value={f.risk_others || ""} onChange={(e) => setF({ ...f, risk_others: e.target.value })} /></Field>
      <Field label="Protective factors & Safety plan"><Textarea value={f.safety_plan || ""} onChange={(e) => setF({ ...f, safety_plan: e.target.value })} /></Field>
      <div className="text-xs text-slate-400">Software does not diagnose risk or make clinical decisions. For authorized professional use.</div>
      <Button onClick={() => onSave(f)} className="bg-slate-900" data-testid="save-risk-btn">Save Risk Assessment</Button>
    </div>
  );
}
