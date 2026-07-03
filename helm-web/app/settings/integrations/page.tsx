"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plug } from "lucide-react";
import IntegrationHealthRow, { type Tool, type Health } from "../../components/settings/IntegrationHealthRow";
import { WORKSPACE_ID } from "../../lib/project";

type ApiIntegration = { id: string; tool: string; health_status: string | null; last_sync_at: string | null };

function mapHealth(s: string | null): Health {
  const v = (s ?? "").toLowerCase();
  if (["green", "healthy", "ok", "active", "connected"].includes(v)) return "green";
  if (["amber", "yellow", "degraded", "warning", "syncing"].includes(v)) return "amber";
  return "red";
}

function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Tool";
}

export default function IntegrationsPage() {
  const [tools, setTools] = useState<Tool[] | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/integrations?workspace_id=${WORKSPACE_ID}`);
      const data = await res.json();
      setTools(
        (data.integrations ?? []).map((i: ApiIntegration) => ({
          id: i.id,
          name: titleCase(i.tool),
          health: mapHealth(i.health_status),
          lastSync: i.last_sync_at ? new Date(i.last_sync_at).toLocaleString() : null,
        }))
      );
    } catch {
      setTools([]);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function disconnect(id: string) {
    if (!confirm("Disconnect this integration?")) return;
    await fetch(`/api/integrations/${id}`, { method: "DELETE" });
    setTools((prev) => (prev ?? []).filter((t) => t.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Settings
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-white">Integrations</h1>
      <p className="mb-6 text-sm text-slate-400">
        Connected trackers and their Helm type mappings.
      </p>

      {tools === null && <div className="h-24 animate-pulse rounded-2xl bg-slate-900" />}

      {tools && tools.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <Plug className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">No integrations connected</p>
          <p className="mt-1 text-sm text-slate-500">
            Connect Jira, Asana, or Slack from your workspace to sync items automatically.
          </p>
        </div>
      )}

      {tools && tools.length > 0 && (
        <div className="space-y-4">
          {tools.map((tool) => (
            <IntegrationHealthRow key={tool.id} tool={tool} onDisconnect={disconnect} />
          ))}
        </div>
      )}
    </div>
  );
}
