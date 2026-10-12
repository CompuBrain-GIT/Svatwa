import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty, Field, Sel, money, useOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Insurance() {
  const providers = useOptions("insurance_provider");
  const [items, setItems] = useState([]); const [open, setOpen] = useState(false);
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null); const [f, setF] = useState({ status: "Submitted" });
  const load = () => api.get("/claims").then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const save = async () => { if (!sel) return toast.error("Select patient"); try { await api.post("/claims", { ...f, patient_id: sel.id, patient_name: sel.name }); toast.success("Claim created"); setOpen(false); setSel(null); setQ(""); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div>
      <PageHeader title="Insurance & Claims" subtitle="TPA claims linked to patient & billing">
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-slate-900" data-testid="new-claim-btn"><Plus size={16} className="mr-1" />New Claim</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>New Insurance Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Patient"><Input value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} /></Field>
              {results.length > 0 && <div className="border rounded-lg divide-y max-h-36 overflow-y-auto">{results.map((p) => <div key={p.id} onClick={() => { setSel(p); setQ(p.name); setResults([]); }} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name}</div>)}</div>}
              <Field label="Provider"><Sel value={f.provider} onChange={(v) => setF({ ...f, provider: v })} options={providers} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Claim No."><Input value={f.claim_number || ""} onChange={(e) => setF({ ...f, claim_number: e.target.value })} /></Field>
                <Field label="Claim Amount"><Input type="number" value={f.claim_amount || ""} onChange={(e) => setF({ ...f, claim_amount: e.target.value })} /></Field></div>
            </div>
            <DialogFooter><Button onClick={save} className="bg-slate-900" disabled={!sel}>Create</Button></DialogFooter>
          </DialogContent></Dialog>
      </PageHeader>
      {items.length === 0 ? <Empty title="No claims" /> : (
        <div className="space-y-2">{items.map((c) => (
          <div key={c.id} className="rounded-lg border bg-white dark:bg-slate-900 p-3 flex justify-between items-center">
            <div><div className="font-medium text-sm">{c.patient_name} · {c.provider}</div><div className="text-xs text-slate-400">{c.claim_number} · {money(c.claim_amount)}</div></div>
            <Badge variant="outline">{c.status}</Badge></div>
        ))}</div>
      )}
    </div>
  );
}
