"use client";

import TestPushButton from "./TestPushButton";
import TypeMappingEditor from "./TypeMappingEditor";

export type Health = "green" | "amber" | "red";
export type Tool = { id: string; name: string; health: Health; lastSync: string | null };

function HealthDot({ health }: { health: Health }) {
  const color = health === "green" ? "bg-green-500" : health === "amber" ? "bg-amber-500" : "bg-red-500";
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />;
}

/** One integration: health, disconnect, test, and type mapping. */
export default function IntegrationHealthRow({ tool, onDisconnect }: { tool: Tool; onDisconnect: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HealthDot health={tool.health} />
          <div>
            <p className="font-medium text-white">{tool.name}</p>
            <p className="text-xs text-slate-500">
              {tool.lastSync ? `Last sync: ${tool.lastSync}` : "Not synced yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TestPushButton integrationId={tool.id} toolName={tool.name} />
          <button
            onClick={() => onDisconnect(tool.id)}
            className="rounded-lg bg-red-950 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900"
          >
            Disconnect
          </button>
        </div>
      </div>
      <TypeMappingEditor />
    </div>
  );
}
