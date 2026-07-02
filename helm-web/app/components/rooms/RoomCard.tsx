import Link from "next/link";
import { Video } from "lucide-react";

/** Compact room card for the calendar / workspace. */
export default function RoomCard({
  id,
  title,
  scheduledTime,
  status,
}: {
  id: string;
  title: string;
  scheduledTime?: string | null;
  status?: string;
}) {
  const live = status === "live";
  return (
    <Link
      href={`/rooms/${id}`}
      className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-600"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400">
        <Video size={18} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-slate-400">
          {live ? "🔴 live now" : scheduledTime ? new Date(scheduledTime).toLocaleString() : "scheduled"}
        </p>
      </div>
    </Link>
  );
}
