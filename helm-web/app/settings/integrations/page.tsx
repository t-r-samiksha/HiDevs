"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Mock integrations UI. TODO: wire to Member 1's integration_configs APIs.
type Health = "green" | "amber" | "red";
type Tool = { id: string; name: string; connected: boolean; health: Health; lastSync: string | null };

const HELM_TYPES = ["decision", "action_item"];
const EXTERNAL_TYPES = ["Task", "Story", "Bug", "Epic"];

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
          <div key={tool.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HealthDot health={tool.connected ? tool.health : "red"} />
                <div>
                  <p className="font-medium text-white">{tool.name}</p>
                  <p className="text-xs text-slate-500">
                    {tool.connected ? `Last sync: ${tool.lastSync}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tool.connected && (
                  <button
                    onClick={() => alert(`Sent a sample ${HELM_TYPES[0]} to ${tool.name} (mock).`)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    Test
                  </button>
                )}
                <button
                  onClick={() => toggle(tool.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    tool.connected
                      ? "bg-red-950 text-red-300 hover:bg-red-900"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {tool.connected ? "Disconnect" : "Connect"}
                </button>
              </div>
            </div>

            {tool.connected && (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Type mapping</p>
                <div className="space-y-2">
                  {HELM_TYPES.map((ht) => (
                    <div key={ht} className="flex items-center gap-2 text-sm">
                      <span className="w-28 capitalize text-slate-300">{ht.replace("_", " ")}</span>
                      <span className="text-slate-600">→</span>
                      <select className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {EXTERNAL_TYPES.map((et) => (
                          <option key={et}>{et}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthDot({ health }: { health: Health }) {
  const color = health === "green" ? "bg-green-500" : health === "amber" ? "bg-amber-500" : "bg-red-500";
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />;
}
