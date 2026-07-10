// Shared status pill — small, rounded-full, muted color-mix background with the
// status color as text. in_progress uses the iris accent (actively steered);
// open is neutral; at_risk/blocked/done map to the semantic gauge colors.

const STATUS_COLOR: Record<string, string> = {
  open: "var(--text-secondary)",
  in_progress: "var(--accent)",
  at_risk: "var(--warning)",
  blocked: "var(--danger)",
  done: "var(--success)",
};

export default function StatusPill({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.open;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${className}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
