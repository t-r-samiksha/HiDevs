"use client";

import TestPushButton from "./TestPushButton";
import TypeMappingEditor from "./TypeMappingEditor";

export type Health = "green" | "amber" | "red";
export type Tool = { id: string; name: string; connected: boolean; health: Health; lastSync: string | null };

function HealthDot({ health }: { health: Health }) {
  const color = health === "green" ? "bg-green-500" : health === "amber" ? "bg-amber-500" : "bg-red-500";
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />;
}

/** One integration: health, connect/disconnect, test, and type mapping. */
export default function IntegrationHealthRow({ tool, onToggle }: { tool: Tool; onToggle: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
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
          {tool.connected && <TestPushButton toolName={tool.name} />}
          <button
            onClick={() => onToggle(tool.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tool.connected ? "bg-red-950 text-red-300 hover:bg-red-900" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {tool.connected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>
      {tool.connected && <TypeMappingEditor />}
    </div>
  );
}
