// Shared trust-score indicator.
// Tiers (from the project design system): >0.85 green, 0.60–0.85 amber, <0.60 red.

function tier(score: number) {
  if (score >= 0.85) return { badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", bar: "bg-green-500" };
  if (score >= 0.6) return { badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", bar: "bg-amber-500" };
  return { badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", bar: "bg-red-500" };
}

export default function TrustScoreBadge({
  score,
  showBar = false,
  className = "",
}: {
  score: number;
  /** When true, render a labelled color bar (used on the item detail page). */
  showBar?: boolean;
  className?: string;
}) {
  const t = tier(score);

  if (showBar) {
    return (
      <div className={className}>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">Trust score</span>
          <span className="font-medium text-slate-200">🛡️ {score.toFixed(2)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full ${t.bar}`} style={{ width: `${Math.round(score * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.badge} ${className}`}
    >
      🛡️ {score.toFixed(2)}
    </span>
  );
}
