"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import IntegrationHealthRow, { type Tool } from "../../components/settings/IntegrationHealthRow";

// Mock integrations UI. TODO: wire to Member 1's integration_configs APIs.
export default function IntegrationsPage() {
  const [tools, setTools] = useState<Tool[]>([
    { id: "jira", name: "Jira", connected: true, health: "green", lastSync: "2 min ago" },
    { id: "asana", name: "Asana", connected: false, health: "red", lastSync: null },
    { id: "slack", name: "Slack", connected: true, health: "amber", lastSync: "1 hr ago" },
  ]);

  function toggle(id: string) {
    setTools((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, connected: !t.connected, health: !t.connected ? "green" : "red", lastSync: !t.connected ? "just now" : null }
          : t
      )
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Settings
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-white">Integrations</h1>
      <p className="mb-6 text-sm text-slate-400">
        Connect external trackers and map Helm item types to their types.
      </p>
      <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/60 px-3 py-2 text-xs text-amber-300">
        Sample UI — live sync arrives with Member 1&apos;s integration APIs.
      </div>

      <div className="space-y-4">
        {tools.map((tool) => (
          <IntegrationHealthRow key={tool.id} tool={tool} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
}
