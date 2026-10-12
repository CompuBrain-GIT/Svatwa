import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, Sel, money, fdate, useOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Printer, Receipt } from "lucide-react";

export default function Billing() {
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [sel, setSel] = useState(null);
  const [summary, setSummary] = useState(null);
  const methods = useOptions("payment_method");
  const services = useOptions("billing_service");

  useEffect(() => { if (q.length >= 2) api.get("/patients", { params: { search: q } }).then((r) => setResults(r.data.items)); else setResults([]); }, [q]);
  const pick = async (p) => { setSel(p); setResults([]); setQ(p.name); loadSummary(p.id); };
  const loadSummary = (pid) => api.get(`/billing/summary/${pid}`).then((r) => setSummary(r.data));

  const addCharge = async (f) => { await api.post("/charges", { ...f, patient_id: sel.id }); toast.success("Charge posted"); loadSummary(sel.id); };
  const addPayment = async (f) => {
    try { await api.post("/payments", { ...f, patient_id: sel.id, patient_name: sel.name }); toast.success("Payment recorded"); loadSummary(sel.id); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title="Billing & Payments" subtitle="Charges auto-post from OPD, IPD, pharmacy & diagnostics" />
      <div className="relative max-w-md mb-4">
        <Input data-testid="billing-search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); setSummary(null); }} placeholder="Search patient by name / mobile / UHID…" />
        {results.length > 0 && <div className="absolute z-10 w-full border rounded-lg bg-white divide-y max-h-48 overflow-y-auto shadow">{results.map((p) => <div key={p.id} onClick={() => pick(p)} data-testid={`billing-result-${p.uhid}`} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">{p.name} <span className="text-xs text-slate-400 font-mono">{p.uhid}</span></div>)}</div>}
      </div>

      {!sel ? <Empty title="Search a patient to view billing" /> : !summary ? <Loading /> : (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div className="font-semibold text-lg">{sel.name} <span className="text-sm text-slate-400 font-mono">{sel.uhid}</span></div>
            <div className="flex gap-2">
              <AddChargeDialog services={services} onSave={addCharge} />
              <AddPaymentDialog outstanding={summary.outstanding} methods={methods} onSave={addPayment} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg border p-3 bg-white"><div className="text-xs text-slate-400">Billed</div><div className="font-mono font-bold text-lg">{money(summary.billed)}</div></div>
            <div className="rounded-lg border p-3 bg-white"><div className="text-xs text-slate-400">Received</div><div className="font-mono font-bold text-lg text-emerald-600">{money(summary.received)}</div></div>
            <div className="rounded-lg border p-3 bg-white"><div className="text-xs text-slate-400">Discount</div><div className="font-mono font-bold text-lg">{money(summary.discount)}</div></div>
            <div className="rounded-lg border p-3 bg-white"><div className="text-xs text-slate-400">Outstanding</div><div className="font-mono font-bold text-lg text-red-600">{money(summary.outstanding)}</div></div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div><div className="text-xs uppercase text-slate-500 mb-2 flex justify-between">Charges <Printer size={14} className="cursor-pointer no-print" onClick={() => window.print()} /></div>
              {summary.charges.length === 0 ? <Empty title="No charges" /> : summary.charges.map((c) => (
                <div key={c.id} className="flex justify-between text-sm border-b py-2"><span>{c.service} <span className="text-slate-400 text-xs">· {c.source} · {fdate(c.created_at)}</span></span><span className="font-mono">{money(c.net)}</span></div>
              ))}
            </div>
            <div><div className="text-xs uppercase text-slate-500 mb-2">Payments</div>
              {summary.payments.length === 0 ? <Empty title="No payments" /> : summary.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm border-b py-2"><span>{p.receipt_no} <span className="text-slate-400 text-xs">· {p.method} · {fdate(p.created_at)}</span></span><span className="font-mono text-emerald-600">{money(p.amount)}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddChargeDialog({ services, onSave }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState({ qty: 1 });
  const save = () => { if (!f.service || !f.amount) return toast.error("Service & amount required"); onSave(f); setOpen(false); setF({ qty: 1 }); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" data-testid="add-charge-btn"><Plus size={16} className="mr-1" />Add Charge</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Charge</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Service"><Input list="svc" value={f.service || ""} onChange={(e) => setF({ ...f, service: e.target.value })} data-testid="charge-service" /><datalist id="svc">{services.map((s) => <option key={s} value={s} />)}</datalist></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Rate"><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="charge-amount" /></Field>
            <Field label="Qty"><Input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
            <Field label="Discount"><Input type="number" value={f.discount || ""} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
          </div>
        </div>
        <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-charge-btn">Post Charge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPaymentDialog({ outstanding, methods, onSave }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState({ method: "Cash" });
  const save = () => { if (!f.amount) return toast.error("Amount required"); onSave(f); setOpen(false); setF({ method: "Cash" }); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-slate-900" data-testid="add-payment-btn"><Receipt size={16} className="mr-1" />Collect Payment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Collect Payment · Outstanding {money(outstanding)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Amount"><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="payment-amount" /></Field>
          <Field label="Method"><Sel value={f.method} onChange={(v) => setF({ ...f, method: v })} options={methods.length ? methods : ["Cash", "UPI", "Card"]} /></Field>
          <Field label="Reference"><Input value={f.reference || ""} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-payment-btn">Record Payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
