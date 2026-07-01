// Shared status pill — used everywhere an item status is shown.
// Colors intentionally match the existing dashboard / meeting / review pages
// (open=blue, in_progress=teal, at_risk=amber, blocked=red, done=green).

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  at_risk: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export default function StatusPill({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style} ${className}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
