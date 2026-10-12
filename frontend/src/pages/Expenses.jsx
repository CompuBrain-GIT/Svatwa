import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty, Field, Sel, money, fdate, useOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Expenses() {
  const cats = useOptions("expense_category"); const methods = useOptions("payment_method");
  const [items, setItems] = useState([]); const [open, setOpen] = useState(false); const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10) });
  const load = () => api.get("/expenses").then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  const save = async () => { if (!f.amount || !f.category) return toast.error("Category & amount required"); try { await api.post("/expenses", f); toast.success("Expense recorded"); setOpen(false); setF({ date: new Date().toISOString().slice(0, 10) }); load(); } catch (e) { toast.error(apiError(e)); } };
  const total = items.reduce((s, e) => s + Number(e.amount || 0), 0);
  return (
    <div>
      <PageHeader title="Expense Management" subtitle={`Total recorded: ${money(total)}`}>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-slate-900" data-testid="new-expense-btn"><Plus size={16} className="mr-1" />Add Expense</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Category"><Sel value={f.category} onChange={(v) => setF({ ...f, category: v })} options={cats.length ? cats : ["Salaries", "Utilities", "Supplies"]} /></Field>
              <Field label="Vendor"><Input value={f.vendor || ""} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Amount"><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="expense-amount" /></Field>
                <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field></div>
              <Field label="Method"><Sel value={f.method} onChange={(v) => setF({ ...f, method: v })} options={methods.length ? methods : ["Cash", "UPI"]} /></Field>
              <Field label="Description"><Input value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-expense-btn">Save</Button></DialogFooter>
          </DialogContent></Dialog>
      </PageHeader>
      {items.length === 0 ? <Empty title="No expenses recorded" /> : (
        <div className="space-y-2">{items.map((e) => (
          <div key={e.id} className="rounded-lg border bg-white dark:bg-slate-900 p-3 flex justify-between"><span className="text-sm">{e.category} <span className="text-slate-400 text-xs">· {e.vendor} · {fdate(e.date)}</span></span><span className="font-mono">{money(e.amount)}</span></div>
        ))}</div>
      )}
    </div>
  );
}
