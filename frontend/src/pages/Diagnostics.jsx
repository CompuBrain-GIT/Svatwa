import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty, Field, money, fdate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const FLOW = { Requested: "Processing", Processing: "Completed", Completed: "Reviewed" };

export default function Diagnostics() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/investigations").then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  const advance = async (i) => { const n = FLOW[i.status]; if (!n) return; await api.put(`/investigations/${i.id}`, { status: n }); toast.success(`→ ${n}`); load(); };

  return (
    <div>
      <PageHeader title="Diagnostics & Investigations" subtitle="Requests · processing · results"><NewInvestigation onDone={load} /></PageHeader>
      {items.length === 0 ? <Empty title="No investigations requested" /> : (
        <div className="space-y-2">{items.map((i) => (
          <div key={i.id} className="rounded-lg border bg-white dark:bg-slate-900 p-4 flex justify-between items-center" data-testid={`inv-${i.id}`}>
            <div><div className="font-medium text-sm">{i.test} <span className="text-xs text-slate-400">· {i.patient_name} · {fdate(i.created_at)}</span></div>
              <div className="text-xs text-slate-500">{i.category} · {i.doctor_name} · {money(i.charge)}</div></div>
            <div className="flex items-center gap-2"><Badge variant="outline">{i.status}</Badge>
              {FLOW[i.status] && <Button size="sm" variant="ghost" className="text-teal-600" onClick={() => advance(i)}>→ {FLOW[i.status]}</Button>}</div>
          </div>
        ))}</div>
      )}
    </div>
  );
}
function NewInvestigation({ onDone }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null); const [f, setF] = useState({});
  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const save = async () => { if (!sel || !f.test) return toast.error("Patient & test required"); try { await api.post("/investigations", { ...f, patient_id: sel.id, patient_name: sel.name }); toast.success("Requested"); setOpen(false); setSel(null); setQ(""); onDone(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-slate-900" data-testid="new-inv-btn"><Plus size={16} className="mr-1" />Request Test</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>Request Investigation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Patient"><Input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} /></Field>
          {results.length > 0 && <div className="border rounded-lg divide-y max-h-36 overflow-y-auto">{results.map((p) => <div key={p.id} onClick={() => { setSel(p); setQ(p.name); setResults([]); }} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name}</div>)}</div>}
          <Field label="Test"><Input value={f.test || ""} onChange={(e) => setF({ ...f, test: e.target.value })} data-testid="inv-test" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Category"><Input value={f.category || ""} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
            <Field label="Charge"><Input type="number" value={f.charge || ""} onChange={(e) => setF({ ...f, charge: e.target.value })} /></Field></div>
        </div>
        <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-inv-btn" disabled={!sel}>Request</Button></DialogFooter>
      </DialogContent></Dialog>
  );
}
