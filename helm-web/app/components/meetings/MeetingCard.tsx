import Link from "next/link";

function SourceBadge({ source }: { source: string | null }) {
  const isLive = source === "live";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isLive ? "bg-purple-900 text-purple-200" : "bg-slate-800 text-slate-300"}`}>
      {isLive ? "🔴 live" : "⬆️ upload"}
    </span>
  );
}

/** A single meeting row in the meetings list. */
export default function MeetingCard({
  id,
  title,
  date,
  sourceType,
  itemCount,
}: {
  id: string;
  title: string;
  date: string;
  sourceType: string | null;
  itemCount: number;
}) {
  return (
    <Link
      href={`/meetings/${id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-white">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{new Date(date).toLocaleDateString()}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SourceBadge source={sourceType} />
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">{itemCount} items</span>
      </div>
    </Link>
  );
}
