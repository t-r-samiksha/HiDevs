export type AuditEntry = { id: string; when: string; type: string; change: string; why: string };

/** Table of adaptive-change audit entries. */
export default function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No changes recorded.</p>;
  }
  return (
    <div className="space-y-3">
      {entries.map((a) => (
        <div key={a.id} className="flex items-start gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
          <span className="mt-0.5 rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-400">{a.type}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-200">{a.change}</p>
            <p className="text-xs text-slate-500">{a.why} · {a.when}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
