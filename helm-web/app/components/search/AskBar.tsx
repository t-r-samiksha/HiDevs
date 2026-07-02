"use client";

export type SearchMode = "search" | "ask";

/** Toggle between semantic Search and AI Ask modes. */
export default function AskBar({ mode, onChange }: { mode: SearchMode; onChange: (m: SearchMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-1">
      {(["search", "ask"] as SearchMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
            mode === m ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
