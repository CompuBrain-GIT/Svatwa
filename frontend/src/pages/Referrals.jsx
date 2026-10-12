import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty, Field, Sel, fdate, useOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Referrals() {
  const sources = useOptions("referral_source");
  const [items, setItems] = useState([]); const [open, setOpen] = useState(false);
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null); const [f, setF] = useState({ type: "External", status: "Open" });
  const load = () => api.get("/referrals").then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const save = async () => { if (!sel) return toast.error("Select patient"); try { await api.post("/referrals", { ...f, patient_id: sel.id, patient_name: sel.name }); toast.success("Referral saved"); setOpen(false); setSel(null); setQ(""); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div>
      <PageHeader title="Referral Management" subtitle="Internal & external referrals">
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-slate-900" data-testid="new-referral-btn"><Plus size={16} className="mr-1" />New Referral</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>New Referral</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Patient"><Input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} /></Field>
              {results.length > 0 && <div className="border rounded-lg divide-y max-h-36 overflow-y-auto">{results.map((p) => <div key={p.id} onClick={() => { setSel(p); setQ(p.name); setResults([]); }} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name}</div>)}</div>}
              <Field label="Source"><Sel value={f.source} onChange={(v) => setF({ ...f, source: v })} options={sources} /></Field>
              <Field label="Type"><Sel value={f.type} onChange={(v) => setF({ ...f, type: v })} options={["Internal", "External"]} /></Field>
              <Field label="Referring Doctor / Org"><Input value={f.referring_doctor || ""} onChange={(e) => setF({ ...f, referring_doctor: e.target.value })} /></Field>
              <Field label="Reason"><Input value={f.reason || ""} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button onClick={save} className="bg-slate-900" disabled={!sel}>Save</Button></DialogFooter>
          </DialogContent></Dialog>
      </PageHeader>
      {items.length === 0 ? <Empty title="No referrals" /> : (
        <div className="space-y-2">{items.map((r) => (
          <div key={r.id} className="rounded-lg border bg-white dark:bg-slate-900 p-3 flex justify-between items-center">
            <div><div className="font-medium text-sm">{r.patient_name}</div><div className="text-xs text-slate-400">{r.type} · {r.source} · {r.referring_doctor} · {fdate(r.date)}</div></div>
            <Badge variant="outline">{r.status}</Badge></div>
        ))}</div>
      )}
    </div>
  );
}
