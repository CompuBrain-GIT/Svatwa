import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Loading, Empty, Field, Sel, money, fdate, useOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, UserPlus, AlertTriangle } from "lucide-react";

export default function Patients() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async (q = "") => {
    setLoading(true);
    try { const { data } = await api.get("/patients", { params: { search: q } }); setItems(data.items); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 350); return () => clearTimeout(t); }, [search]);

  return (
    <div>
      <PageHeader title="Patients" subtitle="Permanent patient profiles · search before creating">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-patient-btn" className="bg-slate-900 hover:bg-slate-800"><UserPlus size={16} className="mr-2" />Register Patient</Button>
          </DialogTrigger>
          <RegisterDialog onDone={(p) => { setOpen(false); load(); if (p) nav(`/patients/${p.id}`); }} />
        </Dialog>
      </PageHeader>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        <Input data-testid="patient-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, mobile, UHID, email…" className="pl-10" />
      </div>

      {loading ? <Loading /> : items.length === 0 ? <Empty title="No patients found" hint="Register a new patient to begin." /> : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">UHID</th><th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Mobile</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Age/Gender</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Last Visit</th>
                <th className="text-right px-4 py-3">Dues</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} data-testid={`patient-row-${p.uhid}`} onClick={() => nav(`/patients/${p.id}`)}
                  className={`border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${p.new_case_alert ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs">{p.uhid}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    {p.name}
                    {p.new_case_alert && <Badge variant="outline" className="ml-2 text-red-600 border-red-300 bg-red-50 text-[10px]"><AlertTriangle size={10} className="mr-1" />New-case (6m+)</Badge>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs">{p.mobile}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{p.age || "—"} / {p.gender || "—"}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs">{fdate(p.last_visit)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${p.dues > 0 ? "text-red-600 font-semibold" : "text-slate-400"}`}>{money(p.dues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RegisterDialog({ onDone }) {
  const doctors = useDoctors();
  const reasons = useOptions("reason_for_visit");
  const langs = useOptions("language");
  const idtypes = useOptions("id_proof_type");
  const insurers = useOptions("insurance_provider");
  const refsources = useOptions("referral_source");
  const [f, setF] = useState({ gender: "Male", insurance_type: "Non-Insurance" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    if (!f.name || !f.mobile) return toast.error("Name and mobile are required");
    setBusy(true);
    try {
      const { data } = await api.post("/patients", f);
      toast.success(`Patient ${data.uhid} registered`);
      onDone(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Patient Registration / Walk-in</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Patient Name" required><Input data-testid="reg-name" value={f.name || ""} onChange={set("name")} /></Field>
        <Field label="Primary Mobile" required><Input data-testid="reg-mobile" value={f.mobile || ""} onChange={set("mobile")} /></Field>
        <Field label="Gender"><Sel testId="reg-gender" value={f.gender} onChange={set("gender")} options={["Male", "Female", "Other"]} /></Field>
        <Field label="Date of Birth"><Input type="date" value={f.dob || ""} onChange={set("dob")} /></Field>
        <Field label="Age"><Input type="number" value={f.age || ""} onChange={set("age")} /></Field>
        <Field label="Blood Group"><Sel value={f.blood_group} onChange={set("blood_group")} options={["A+","A-","B+","B-","O+","O-","AB+","AB-"]} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="City"><Input value={f.city || ""} onChange={set("city")} /></Field>
        <Field label="State"><Input value={f.state || ""} onChange={set("state")} /></Field>
        <Field label="Preferred Doctor"><Sel value={f.preferred_doctor} onChange={set("preferred_doctor")} options={doctors.map(d => d.name)} /></Field>
        <Field label="Reason for Visit"><Sel value={f.reason} onChange={set("reason")} options={reasons} /></Field>
        <Field label="Referral Source"><Sel value={f.referral_source} onChange={set("referral_source")} options={refsources} /></Field>
        <Field label="Preferred Language"><Sel value={f.preferred_language} onChange={set("preferred_language")} options={langs} /></Field>
        <Field label="ABHA ID"><Input value={f.abha_id || ""} onChange={set("abha_id")} /></Field>
        <Field label="Insurance Type"><Sel testId="reg-insurance-type" value={f.insurance_type} onChange={set("insurance_type")} options={["Non-Insurance", "Insurance"]} /></Field>
        {f.insurance_type === "Insurance" && <>
          <Field label="Insurance Provider"><Sel value={f.insurance_provider} onChange={set("insurance_provider")} options={insurers} /></Field>
          <Field label="Policy / TPA No."><Input value={f.insurance_policy || ""} onChange={set("insurance_policy")} /></Field>
        </>}
        <Field label="ID Proof Type"><Sel value={f.id_proof_type} onChange={set("id_proof_type")} options={idtypes} /></Field>
        <Field label="ID Proof Number"><Input value={f.id_proof_number || ""} onChange={set("id_proof_number")} /></Field>
        <Field label="Guardian / Spouse"><Input value={f.guardian_name || ""} onChange={set("guardian_name")} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy} data-testid="reg-submit" className="bg-slate-900 hover:bg-slate-800">{busy ? "Saving…" : "Register Patient"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function useDoctors() {
  const [docs, setDocs] = useState([]);
  useEffect(() => { api.get("/staff", { params: { role: "doctor,psychologist" } }).then((r) => setDocs(r.data.items)).catch(() => {}); }, []);
  return docs;
}
