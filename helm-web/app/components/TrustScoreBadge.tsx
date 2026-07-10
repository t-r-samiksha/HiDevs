// The Trust Meter — Helm's signature. Trust is the product's core (every item
// is Enkrypt-validated), so it reads as an instrument, not a badge: a small
// 3-bar signal gauge. Tiers: >0.85 = 3 bars (high), 0.60–0.85 = 2 bars (med),
// <0.60 = 1 bar (low). Hover shows the exact score.

function tierInfo(score: number): { filled: number; color: string; label: string } {
  if (score >= 0.85) return { filled: 3, color: "var(--success)", label: "high" };
  if (score >= 0.6) return { filled: 2, color: "var(--warning)", label: "medium" };
  return { filled: 1, color: "var(--danger)", label: "low" };
}

export default function TrustScoreBadge({
  score,
  showBar = false,
  className = "",
}: {
  score: number;
  /** Labelled progress bar (item detail page). */
  showBar?: boolean;
  className?: string;
}) {
  const t = tierInfo(score);

  if (showBar) {
    return (
      <div className={className}>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-400">Trust score</span>
          <span className="font-mono font-medium text-slate-200">{score.toFixed(2)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round(score * 100)}%`, background: t.color }}
          />
        </div>
      </div>
    );
  }

  const heights = [5, 8, 11];
  return (
    <span
      title={`Trust ${score.toFixed(2)} · ${t.label}`}
      aria-label={`Trust score ${score.toFixed(2)}`}
      className={`inline-flex shrink-0 cursor-default items-end gap-[2px] ${className}`}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: h, background: i < t.filled ? t.color : "var(--border-hover)" }}
        />
      ))}
    </span>
  );
}
