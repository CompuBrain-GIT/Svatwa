import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Settings() {
  const [f, setF] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setF(r.data)); }, []);
  if (!f) return <Loading />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => { try { await api.put("/settings", f); toast.success("Settings saved"); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div className="max-w-2xl">
      <PageHeader title="Hospital Settings" subtitle="Branding, billing & operational configuration" />
      <div className="rounded-xl border bg-white dark:bg-slate-900 p-5 grid sm:grid-cols-2 gap-4">
        <Field label="Hospital Name"><Input value={f.hospital_name || ""} onChange={set("hospital_name")} data-testid="set-hospital-name" /></Field>
        <Field label="Currency"><Input value={f.currency || ""} onChange={set("currency")} /></Field>
        <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Address"><Input value={f.address || ""} onChange={set("address")} /></Field>
        <Field label="Pending Dues Threshold (₹)"><Input type="number" value={f.pending_dues_threshold || 5000} onChange={set("pending_dues_threshold")} data-testid="set-threshold" /></Field>
      </div>
      <Button onClick={save} className="bg-slate-900 mt-4" data-testid="save-settings-btn">Save Settings</Button>
    </div>
  );
}
