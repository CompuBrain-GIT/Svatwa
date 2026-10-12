import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { toast } from "sonner";
import { Brain } from "lucide-react";

const DEMO = [
  ["Super Admin", "bijoy@compubrain.com", "admin123"],
  ["Psychiatrist", "doctor@svatwa.com", "doctor123"],
  ["Psychologist", "psych@svatwa.com", "psych123"],
  ["Nurse", "nurse@svatwa.com", "nurse123"],
  ["Reception", "reception@svatwa.com", "reception123"],
  ["Pharmacist", "pharmacy@svatwa.com", "pharmacy123"],
  ["Billing", "billing@svatwa.com", "billing123"],
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("bijoy@compubrain.com");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}`);
      nav("/");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-900 text-white relative overflow-hidden">
        <div className="relative z-10"><Logo /></div>
        <div className="relative z-10 max-w-md">
          <Brain size={40} className="text-teal-400 mb-6" />
          <h2 className="text-3xl font-head font-bold leading-tight">Advanced Psychiatric Hospital Management</h2>
          <p className="text-slate-300 mt-4 text-sm leading-relaxed">
            One patient, many cases, every visit connected — OPD, IPD, clinical care, pharmacy,
            billing and analytics on one secure, role-based platform.
          </p>
        </div>
        <div className="relative z-10 text-xs text-slate-400">Secure · Audit-ready · Configurable</div>
        <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center"><Logo /></div>
          <h1 className="text-2xl font-head font-bold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500 mb-6">Access your SvaTWA workspace</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><Input data-testid="login-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></Field>
            <Field label="Password"><Input data-testid="login-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></Field>
            <Button type="submit" disabled={busy} data-testid="login-submit" className="w-full bg-slate-900 hover:bg-slate-800">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Demo accounts (tap to fill)</div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(([role, e, p]) => (
                <button key={e} onClick={() => { setEmail(e); setPassword(p); }} data-testid={`demo-${role.toLowerCase().replace(/ /g,'-')}`}
                  className="text-left text-xs rounded-lg border border-slate-200 px-3 py-2 hover:border-teal-400 hover:bg-teal-50">
                  <div className="font-semibold text-slate-700">{role}</div>
                  <div className="text-slate-400 truncate">{e}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
