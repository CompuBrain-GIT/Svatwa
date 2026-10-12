import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, money, fdate, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Pharmacy() {
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [active, setActive] = useState(null);
  const load = async () => {
    const [q, h, a] = await Promise.all([api.get("/pharmacy/queue"), api.get("/pharmacy/history"), api.get("/pharmacy/analytics")]);
    setQueue(q.data.items); setHistory(h.data.items); setAnalytics(a.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Pharmacy" subtitle="Prescription queue · dispensing · history" />
      <Tabs defaultValue="queue">
        <TabsList><TabsTrigger value="queue" data-testid="tab-pharm-queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-pharm-history">Dispensing History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList>

        <TabsContent value="queue" className="mt-4 space-y-2">
          {queue.length === 0 ? <Empty title="No pending prescriptions" /> : queue.map((rx) => (
            <div key={rx.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex justify-between items-start" data-testid={`pharm-rx-${rx.id}`}>
              <div>
                <div className="font-medium text-sm">{rx.patient_name} <span className="text-xs text-slate-400">· {rx.doctor_name} · {fdate(rx.created_at)}</span></div>
                <ul className="text-sm text-slate-600 mt-1">{rx.items.map((it, i) => <li key={i}>• {it.medicine} {it.strength} — {it.dose} × {it.duration}d</li>)}</ul>
              </div>
              <Button size="sm" className="bg-slate-900" onClick={() => setActive(rx)} data-testid={`dispense-btn-${rx.id}`}>Dispense</Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-2">
          {history.length === 0 ? <Empty title="No dispensing records" /> : history.map((d) => (
            <div key={d.id} className="rounded-lg border p-4 bg-white dark:bg-slate-900">
              <div className="flex justify-between"><span className="font-medium text-sm">{d.patient_name} · {fdate(d.created_at)}</span><span className="font-mono text-sm">{money(d.total)}</span></div>
              <div className="text-xs text-slate-500">By {d.dispensed_by} · {d.doctor_name}</div>
              <ul className="text-sm text-slate-600 mt-1">{d.items.map((it, i) => <li key={i}>• {it.name} × {it.quantity}</li>)}</ul>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          {analytics && <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <StatCard label="Pharmacy Revenue" value={money(analytics.revenue)} accent="green" />
              <StatCard label="Dispensations" value={analytics.dispense_count} />
              <StatCard label="Unique Medicines" value={Object.keys(analytics.by_medicine).length} />
            </div>
            <div className="text-xs uppercase text-slate-500 mb-2">Top medicines dispensed</div>
            {Object.entries(analytics.by_medicine).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v]) => (
              <div key={k} className="flex justify-between text-sm border-b py-1.5"><span>{k}</span><span className="font-mono">{v} units</span></div>
            ))}
          </>}
        </TabsContent>
      </Tabs>
      {active && <DispenseDialog rx={active} onClose={() => setActive(null)} onDone={() => { setActive(null); load(); }} />}
    </div>
  );
}

function DispenseDialog({ rx, onClose, onDone }) {
  const [meds, setMeds] = useState([]);
  const [items, setItems] = useState(rx.items.map((it) => ({ ...it, quantity: Number(it.duration) || 1 })));
  useEffect(() => { api.get("/medicines").then((r) => setMeds(r.data.items)); }, []);
  const setQ = (i, v) => setItems((s) => s.map((it, idx) => idx === i ? { ...it, quantity: v } : it));
  const save = async () => {
    const payload = items.map((it) => ({ medicine_id: (meds.find((m) => m.name === it.medicine) || {}).id, quantity: Number(it.quantity) }));
    try {
      await api.post("/pharmacy/dispense", { prescription_id: rx.id, patient_id: rx.patient_id, patient_name: rx.patient_name,
        case_id: rx.case_id, doctor_name: rx.doctor_name, items: payload.filter((p) => p.medicine_id) });
      toast.success("Dispensed · stock deducted · billed"); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dispense — {rx.patient_name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {items.map((it, i) => {
            const m = meds.find((x) => x.name === it.medicine);
            return (
              <div key={i} className="flex items-center justify-between gap-2 border-b py-2">
                <div className="text-sm"><div className="font-medium">{it.medicine} {it.strength}</div><div className="text-xs text-slate-400">Stock: {m?.stock ?? "?"} · ₹{m?.price ?? 0}</div></div>
                <Input type="number" value={it.quantity} onChange={(e) => setQ(i, e.target.value)} className="w-20" data-testid={`qty-${i}`} />
              </div>
            );
          })}
        </div>
        <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="confirm-dispense-btn">Confirm Dispensing</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
