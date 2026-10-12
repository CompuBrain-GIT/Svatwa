import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Loading, Empty, ftime } from "@/components/common";
import { Badge } from "@/components/ui/badge";

export default function Audit() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/audit").then((r) => setItems(r.data.items)).catch(() => setItems([])); }, []);
  if (!items) return <Loading />;
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Immutable record of important system activity" />
      {items.length === 0 ? <Empty title="No audit entries" /> : (
        <div className="rounded-xl border bg-white dark:bg-slate-900 divide-y">
          {items.map((a) => (
            <div key={a.id} className="flex justify-between items-center px-4 py-2.5 text-sm">
              <div><span className="font-medium capitalize">{a.action}</span> <span className="text-slate-400">on {a.entity}</span>
                <span className="text-xs text-slate-400 ml-2">by {a.user_name} ({a.role})</span></div>
              <span className="text-xs text-slate-400 font-mono">{ftime(a.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
