import AuditLogTable, { type AuditEntry } from "./AuditLogTable";

/** "Recent adaptive changes" panel — what changed, why, and when. */
export default function LearningDashboard({ entries }: { entries: AuditEntry[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Recent adaptive changes</h2>
      <AuditLogTable entries={entries} />
    </section>
  );
}
