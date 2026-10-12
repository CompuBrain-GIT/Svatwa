import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty, Field, Sel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Users() {
  const [items, setItems] = useState([]); const [roles, setRoles] = useState([]); const [edit, setEdit] = useState(null); const [f, setF] = useState({});
  const load = () => api.get("/users").then((r) => setItems(r.data.items));
  useEffect(() => { load(); api.get("/auth/roles").then((r) => setRoles(r.data.roles)); }, []);
  const save = async () => {
    try { if (edit?.id) await api.put(`/users/${edit.id}`, f); else await api.post("/users", f); toast.success("Saved"); setEdit(null); setF({}); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div>
      <PageHeader title="Users & Roles" subtitle="Role-based access across all modules">
        <Button className="bg-slate-900" onClick={() => { setEdit({}); setF({ role: "reception" }); }} data-testid="add-user-btn"><Plus size={16} className="mr-1" />Add User</Button>
      </PageHeader>
      {items.length === 0 ? <Empty /> : (
        <div className="rounded-xl border bg-white dark:bg-slate-900 divide-y">
          {items.map((u) => (
            <div key={u.id} className="flex justify-between items-center px-4 py-3" data-testid={`user-${u.email}`}>
              <div><div className="font-medium text-sm">{u.name}</div><div className="text-xs text-slate-400">{u.email}</div></div>
              <div className="flex items-center gap-2"><Badge variant="outline">{u.role_label}</Badge>{u.status === "inactive" && <Badge className="bg-red-100 text-red-700">inactive</Badge>}
                <Button size="sm" variant="ghost" onClick={() => { setEdit(u); setF({ name: u.name, role: u.role, status: u.status }); }}>Edit</Button></div>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)}><DialogContent>
          <DialogHeader><DialogTitle>{edit.id ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name"><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="user-name" /></Field>
            {!edit.id && <Field label="Email"><Input value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="user-email" /></Field>}
            <Field label="Role"><Sel value={f.role} onChange={(v) => setF({ ...f, role: v })} options={roles.map((r) => ({ value: r.value, label: r.label }))} /></Field>
            <Field label={edit.id ? "New Password (optional)" : "Password"}><Input type="password" value={f.password || ""} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="user-password" /></Field>
          </div>
          <DialogFooter><Button onClick={save} className="bg-slate-900" data-testid="save-user-btn">Save</Button></DialogFooter>
        </DialogContent></Dialog>
      )}
    </div>
  );
}
