"use client";

/** Versioned prompt editor with restore-default. */
export default function PromptEditor({
  value,
  onChange,
  onRestore,
}: {
  value: string;
  onChange: (v: string) => void;
  onRestore: () => void;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Extraction prompt</h2>
        <button onClick={onRestore} className="text-xs text-blue-400 hover:underline">
          Restore default
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </section>
  );
}
