"use client";

import Link from "next/link";

type LinkedItem = { id: string; text: string; status: string };

/**
 * Renders an item's dependencies:
 * - resolved `depends_on` links as clickable pills to the target item
 * - raw `dependency_hints` phrases as static pills
 */
export default function DependencyChips({
  linked,
  hints,
}: {
  linked: LinkedItem[];
  hints: string[];
}) {
  if (linked.length === 0 && hints.length === 0) {
    return <p className="text-sm text-slate-500">No dependencies.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {linked.map((dep) => (
        <Link
          key={dep.id}
          href={`/items/${dep.id}`}
          title={dep.text}
          className="inline-flex max-w-xs items-center gap-1 truncate rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:border-blue-500 hover:text-blue-300"
        >
          🔗 <span className="truncate">{dep.text}</span>
        </Link>
      ))}
      {hints.map((hint, i) => (
        <span
          key={`hint-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400"
        >
          🔗 {hint}
        </span>
      ))}
    </div>
  );
}
