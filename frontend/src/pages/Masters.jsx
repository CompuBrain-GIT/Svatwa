import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Upload, Search } from "lucide-react";

export default function Masters() {
  return (
    <div>
      <PageHeader title="Masters & Configuration" subtitle="All configurable hospital data — changes reflect across modules instantly" />
      <Tabs defaultValue="masters">
        <TabsList><TabsTrigger value="masters" data-testid="tab-masters">Masters</TabsTrigger><TabsTrigger value="diagnoses" data-testid="tab-diagnoses">Diagnoses</TabsTrigger><TabsTrigger value="medicines" data-testid="tab-medicines">Medicines</TabsTrigger></TabsList>
        <TabsContent value="masters" className="mt-4"><GenericMasters /></TabsContent>
        <TabsContent value="diagnoses" className="mt-4"><Diagnoses /></TabsContent>
        <TabsContent value="medicines" className="mt-4"><Medicines /></TabsContent>
      </Tabs>
    </div>
  );
}

function GenericMasters() {
  const [types, setTypes] = useState([]); const [active, setActive] = useState(null); const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null); const [f, setF] = useState({});
  useEffect(() => { api.get("/masters/_types").then((r) => { setTypes(r.data.types); setActive(r.data.types[0]?.type); }); }, []);
  useEffect(() => { if (active) load(active); }, [active]);
  const load = (t) => api.get(`/masters/${t}`).then((r) => setItems(r.data.items));
  const save = async () => {
    try {
      if (edit?.id) await api.put(`/masters/${active}/${edit.id}`, f); else await api.post(`/masters/${active}`, f);
      toast.success("Saved"); setEdit(null); setF({}); load(active);
    } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { await api.delete(`/masters/${active}/${id}`); toast.success("Deactivated"); load(active); };

  return (
    <div className="grid md:grid-cols-4 gap-4">
      <div className="md:col-span-1 border rounded-xl bg-white dark:bg-slate-900 p-2 max-h-[70vh] overflow-y-auto">
        {types.map((t) => (
          <button key={t.type} onClick={() => setActive(t.type)} data-testid={`mtype-${t.type}`} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center ${active === t.type ? "bg-slate-900 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
            {t.label}<Badge variant="outline" className={active === t.type ? "bg-white/20 text-white border-white/30" : ""}>{t.count}</Badge>
          </button>
        ))}
      </div>
      <div className="md:col-span-3">
        <div className="flex justify-end mb-3"><Button className="bg-slate-900" onClick={() => { setEdit({}); setF({ status: "active" }); }} data-testid="add-master-btn"><Plus size={16} className="mr-1" />Add</Button></div>
        {items.length === 0 ? <Empty title="No entries" /> : (
          <div className="rounded-xl border bg-white dark:bg-slate-900 divide-y">
            {items.map((it) => (
              <div key={it.id} className="flex justify-between items-center px-4 py-2.5 text-sm">
                <div><span className="font-medium">{it.name}</span> {it.code && <span className="text-xs text-slate-400 font-mono ml-2">{it.code}</span>}
                  {it.charge && <span className="text-xs text-slate-400 ml-2">₹{it.charge}</span>} {it.bed_status && <Badge variant="outline" className="ml-2 text-[10px]">{it.bed_status}</Badge>}</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEdit(it); setF(it); }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => del(it.id)}>Off</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)}><DialogContent>
          <DialogHeader><DialogTitle>{edit.id ? "Edit" : "Add"} entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name" required><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="master-name" /></Field>
            <Field label="Code"><Input value={f.code || ""} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            {active === "bed" && <Field label="Bed Status"><select value={f.bed_status || "available"} onChange={(e) => setF({ ...f, bed_status: e.target.value })} className="h-10 w-full rounded-md border px-3 text-sm"><option>available</option><option>reserved</option><option>maintenance</option><option>blocked</option><option>cleaning</option></select></Field>}
          </div>
          <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-master-btn">Save</Button></DialogFooter>
        </DialogContent></Dialog>
      )}
    </div>
  );
}

function Diagnoses() {
  const [items, setItems] = useState([]); const [q, setQ] = useState(""); const [bulk, setBulk] = useState(false);
  const load = (s = "") => api.get("/diagnoses", { params: { search: s, limit: 200 } }).then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);
  return (
    <div>
      <div className="flex justify-between mb-3 gap-2">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code / name…" className="pl-9" data-testid="dx-search" /></div>
        <Button className="bg-slate-900" onClick={() => setBulk(true)} data-testid="bulk-dx-btn"><Upload size={16} className="mr-1" />Bulk Upload</Button>
      </div>
      <div className="rounded-xl border bg-white dark:bg-slate-900 divide-y max-h-[60vh] overflow-y-auto">
        {items.map((d) => <div key={d.id} className="flex gap-4 px-4 py-2 text-sm"><span className="font-mono text-teal-600 w-20">{d.code}</span><span>{d.name}</span></div>)}
      </div>
      {bulk && <BulkDx onClose={() => setBulk(false)} onDone={() => { setBulk(false); load(); }} />}
    </div>
  );
}
function BulkDx({ onClose, onDone }) {
  const [csv, setCsv] = useState("Code,Diagnosis\n6A80,Cyclothymic disorder\n6B23,Hoarding disorder"); const [preview, setPreview] = useState(null);
  const doPreview = async () => { const { data } = await api.post("/diagnoses/bulk", { csv, preview: true }); setPreview(data); };
  const doImport = async () => { try { const { data } = await api.post("/diagnoses/bulk", { csv, preview: false }); toast.success(`Imported ${data.imported}, ${data.error_count} errors`); onDone(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Bulk Upload Diagnoses (CSV: Code, Diagnosis)</DialogTitle></DialogHeader>
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} className="font-mono text-xs" data-testid="bulk-csv" />
      {preview && <div className="text-sm bg-slate-50 rounded-lg p-3"><div className="text-emerald-600">{preview.valid_count} valid</div><div className="text-red-600">{preview.error_count} errors</div>{preview.errors?.slice(0, 5).map((e, i) => <div key={i} className="text-xs text-slate-500">Row {e.row}: {e.reason}</div>)}</div>}
      <DialogFooter className="gap-2"><Button variant="outline" onClick={doPreview} data-testid="dx-preview-btn">Preview</Button><Button className="bg-slate-900" onClick={doImport} data-testid="dx-import-btn">Import</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function Medicines() {
  const [items, setItems] = useState([]); const [q, setQ] = useState(""); const [edit, setEdit] = useState(null); const [f, setF] = useState({});
  const load = (s = "") => api.get("/medicines", { params: { search: s, limit: 300 } }).then((r) => setItems(r.data.items));
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);
  const save = async () => { try { if (edit?.id) await api.put(`/medicines/${edit.id}`, f); else await api.post("/medicines", f); toast.success("Saved"); setEdit(null); setF({}); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div>
      <div className="flex justify-between mb-3"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicine…" className="max-w-sm" data-testid="med-search" /><Button className="bg-slate-900" onClick={() => { setEdit({}); setF({ unit: "tablet", stock: 50, reorder_level: 10 }); }} data-testid="add-med-btn"><Plus size={16} className="mr-1" />Add Medicine</Button></div>
      <div className="rounded-xl border bg-white dark:bg-slate-900 divide-y max-h-[60vh] overflow-y-auto">
        {items.map((m) => <div key={m.id} className="flex justify-between px-4 py-2 text-sm"><span>{m.name} <span className="text-xs text-slate-400">{m.strength} · {m.category}</span></span><div className="flex items-center gap-3"><span className="font-mono text-xs">Stock {m.stock} · ₹{m.price}</span><Button size="sm" variant="ghost" onClick={() => { setEdit(m); setF(m); }}>Edit</Button></div></div>)}
      </div>
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)}><DialogContent>
          <DialogHeader><DialogTitle>{edit.id ? "Edit" : "Add"} Medicine</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="med-name" /></Field>
            <Field label="Generic"><Input value={f.generic || ""} onChange={(e) => setF({ ...f, generic: e.target.value })} /></Field>
            <Field label="Strength"><Input value={f.strength || ""} onChange={(e) => setF({ ...f, strength: e.target.value })} /></Field>
            <Field label="Category"><Input value={f.category || ""} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
            <Field label="Price"><Input type="number" value={f.price || ""} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
            <Field label="Stock"><Input type="number" value={f.stock || ""} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-med-btn">Save</Button></DialogFooter>
        </DialogContent></Dialog>
      )}
    </div>
  );
}
