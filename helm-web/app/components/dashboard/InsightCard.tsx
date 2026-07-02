import Link from "next/link";

export type Insight = {
  id: string;
  text: string;
  /** Optional one-tap action. */
  actionLabel?: string;
  actionHref?: string;
};

/** A strategic-signal card with an optional one-tap action. */
export default function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-800 bg-blue-950/50 p-4">
      <p className="text-sm text-blue-100">
        <span className="mr-1">💡</span>
        {insight.text}
      </p>
      {insight.actionLabel && insight.actionHref && (
        <Link
          href={insight.actionHref}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {insight.actionLabel}
        </Link>
      )}
    </div>
  );
}
