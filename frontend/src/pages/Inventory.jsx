import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, money } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Inventory() {
  const [meds, setMeds] = useState([]); const [active, setActive] = useState(null);
  const load = () => api.get("/medicines", { params: { limit: 500 } }).then((r) => setMeds(r.data.items));
  useEffect(() => { load(); }, []);
  const save = async (f) => { try { await api.post("/inventory/stock", f); toast.success("Stock updated"); setActive(null); load(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Inventory & Stock" subtitle="Medicines, stock levels & reorder alerts" />
      <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500"><tr>
            <th className="text-left px-4 py-3">Medicine</th><th className="text-left px-4 py-3 hidden sm:table-cell">Category</th>
            <th className="text-right px-4 py-3">Stock</th><th className="text-right px-4 py-3 hidden sm:table-cell">Price</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>{meds.map((m) => {
            const low = m.stock <= m.reorder_level;
            return (<tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-3 font-medium">{m.name} <span className="text-xs text-slate-400">{m.strength}</span></td>
              <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{m.category}</td>
              <td className="px-4 py-3 text-right font-mono">{m.stock} {low && <Badge className="bg-red-100 text-red-700 ml-1 text-[10px]">Low</Badge>}</td>
              <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">{money(m.price)}</td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setActive(m)} data-testid={`stock-btn-${m.id}`}>Stock In</Button></td>
            </tr>);
          })}</tbody>
        </table>
      </div>
      {active && <StockDialog med={active} onClose={() => setActive(null)} onSave={save} />}
    </div>
  );
}
function StockDialog({ med, onClose, onSave }) {
  const [f, setF] = useState({ medicine_id: med.id, type: "stock_in", qty: 10 });
  return (
    <Dialog open onOpenChange={onClose}><DialogContent>
      <DialogHeader><DialogTitle>Stock movement — {med.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="h-10 w-full rounded-md border px-3 text-sm"><option value="stock_in">Stock In</option><option value="purchase">Purchase</option><option value="adjustment_add">Adjustment (+)</option><option value="damaged">Damaged (−)</option><option value="expired">Expired (−)</option></select></Field>
        <Field label="Quantity"><Input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} data-testid="stock-qty" /></Field>
      </div>
      <DialogFooter><Button onClick={() => onSave(f)} className="bg-slate-900" data-testid="save-stock-btn">Apply</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
