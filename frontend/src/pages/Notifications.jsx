import React, { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty, Field, Sel, ftime, StatCard, useOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Bell } from "lucide-react";

export default function Notifications() {
  const [notifs, setNotifs] = useState([]); const [campaigns, setCampaigns] = useState([]); const [totals, setTotals] = useState({});
  const load = async () => {
    const [n, c] = await Promise.all([api.get("/notifications"), api.get("/campaigns").catch(() => ({ data: { items: [], totals: {} } }))]);
    setNotifs(n.data.items); setCampaigns(c.data.items); setTotals(c.data.totals || {});
  };
  useEffect(() => { load(); }, []);
  const markRead = async (id) => { await api.put(`/notifications/${id}/read`); load(); };

  return (
    <div>
      <PageHeader title="Notifications & Campaigns" subtitle="In-app alerts, segment campaigns & surveys" />
      <Tabs defaultValue="inbox">
        <TabsList><TabsTrigger value="inbox" data-testid="tab-inbox">Inbox</TabsTrigger><TabsTrigger value="campaigns" data-testid="tab-campaigns">Campaigns</TabsTrigger></TabsList>
        <TabsContent value="inbox" className="mt-4 space-y-2">
          {notifs.length === 0 ? <Empty title="No notifications" /> : notifs.map((n) => (
            <div key={n.id} onClick={() => !n.read && markRead(n.id)} className={`rounded-lg border p-3 flex justify-between items-start cursor-pointer ${n.read ? "bg-white dark:bg-slate-900" : "bg-teal-50/50 border-teal-200"}`} data-testid={`notif-${n.id}`}>
              <div className="flex gap-3"><Bell size={16} className="text-teal-600 mt-0.5" /><div><div className="font-medium text-sm">{n.title}</div><div className="text-sm text-slate-500">{n.message}</div></div></div>
              <span className="text-xs text-slate-400">{ftime(n.created_at)}</span>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <div className="grid grid-cols-3 gap-3 mb-4"><StatCard label="Campaigns" value={totals.campaigns || 0} /><StatCard label="Sent" value={totals.sent || 0} accent="teal" /><StatCard label="Responses" value={totals.responses || 0} accent="green" /></div>
          <CampaignBuilder onDone={load} />
          <div className="mt-4 space-y-2">{campaigns.map((c) => (
            <div key={c.id} className="rounded-lg border bg-white dark:bg-slate-900 p-3"><div className="flex justify-between"><span className="font-medium text-sm">{c.title}</span><Badge variant="outline">{c.recipient_count} recipients</Badge></div><div className="text-sm text-slate-500">{c.message}</div>{c.survey && <Badge className="mt-1 bg-blue-100 text-blue-700 text-[10px]">Survey: {c.survey.question}</Badge>}</div>
          ))}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CampaignBuilder({ onDone }) {
  const diseases = useOptions("disease");
  const [f, setF] = useState({ channel: "in_app" });
  const [preview, setPreview] = useState(null);
  const [survey, setSurvey] = useState(false);
  const doPreview = async () => { const { data } = await api.post("/segments/preview", { disease: f.disease, gender: f.gender }); setPreview(data); };
  const send = async () => {
    if (!preview) return toast.error("Preview recipients first");
    if (!f.title || !f.message) return toast.error("Title & message required");
    try {
      await api.post("/campaigns", { title: f.title, message: f.message, channel: f.channel, patient_ids: preview.patient_ids,
        segment: { disease: f.disease, gender: f.gender }, survey: survey ? { question: f.sq, type: "yes_no" } : null });
      toast.success(`Campaign sent to ${preview.count} patients`); setF({ channel: "in_app" }); setPreview(null); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="text-sm font-semibold">New Campaign</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Segment: Disease"><Sel value={f.disease} onChange={(v) => setF({ ...f, disease: v })} options={diseases} placeholder="Any" /></Field>
        <Field label="Segment: Gender"><Sel value={f.gender} onChange={(v) => setF({ ...f, gender: v })} options={["Male", "Female"]} placeholder="Any" /></Field>
      </div>
      <Button variant="outline" size="sm" onClick={doPreview} data-testid="preview-segment-btn">Preview recipients</Button>
      {preview && <div className="text-xs bg-slate-50 rounded-lg p-2">{preview.count} patients · {preview.sample.map((s) => s.name).join(", ")}{preview.count > preview.sample.length ? "…" : ""}</div>}
      <Field label="Title"><Input value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="campaign-title" /></Field>
      <Field label="Message"><Textarea value={f.message || ""} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="campaign-message" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={survey} onChange={(e) => setSurvey(e.target.checked)} />Attach Yes/No survey</label>
      {survey && <Field label="Survey question"><Input value={f.sq || ""} onChange={(e) => setF({ ...f, sq: e.target.value })} placeholder="e.g. Are you still smoking?" /></Field>}
      <Button onClick={send} className="bg-slate-900" data-testid="send-campaign-btn"><Send size={15} className="mr-2" />Send Campaign</Button>
    </div>
  );
}
