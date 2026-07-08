"use client";

/** Versioned prompt editor with per-agent selection, save, and restore-default. */
export default function PromptEditor({
  agents,
  selectedId,
  onSelect,
  value,
  onChange,
  onSave,
  onRestore,
  saving,
  isOverridden,
  status,
}: {
  agents: { agentId: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onRestore: () => void;
  saving: boolean;
  isOverridden: boolean;
  status: string | null;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Agent prompts</h2>
        <div className="flex items-center gap-2">
          {isOverridden && (
            <span className="rounded-full bg-blue-950 px-2 py-0.5 text-[10px] font-medium text-blue-300">
              customized
            </span>
          )}
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving || !selectedId}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save prompt"}
        </button>
        <button
          onClick={onRestore}
          disabled={saving || !selectedId}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          Restore default
        </button>
        {status && <span className="text-xs text-slate-500">{status}</span>}
      </div>
    </section>
  );
}
