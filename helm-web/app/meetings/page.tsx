"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Meeting = {
  id: string;
  title: string;
  date: string;
  source_type: string | null;
  created_at: string;
};

const PAGE_SIZE = 10;

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  async function load() {
    const [meetRes, itemsRes] = await Promise.all([
      supabase.from("meetings").select("*").order("created_at", { ascending: false }),
      supabase.from("items").select("meeting_id"),
    ]);
    if (meetRes.error) {
      setError(meetRes.error.message);
      setMeetings([]);
      return;
    }
    setError(null);
    setMeetings((meetRes.data as Meeting[]) ?? []);
    const c = new Map<string, number>();
    (itemsRes.data ?? []).forEach((r: { meeting_id: string }) =>
      c.set(r.meeting_id, (c.get(r.meeting_id) ?? 0) + 1)
    );
    setCounts(c);
  }

  useEffect(() => {
    // Initial data fetch on mount is a legitimate effect use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const total = meetings?.length ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const paged = (meetings ?? []).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Meetings</h1>
        <p className="mt-1 text-sm text-slate-400">All processed meetings, newest first.</p>
      </div>

      {meetings === null && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
          <p className="text-sm text-red-300">Failed to load meetings: {error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-800 px-4 py-1.5 text-sm text-red-100 hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {meetings && meetings.length === 0 && !error && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <Mic className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">No meetings yet</p>
          <p className="mt-1 text-sm text-slate-500">Upload your first transcript to get started.</p>
          <a href="/upload" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Upload transcript
          </a>
        </div>
      )}

      {meetings && meetings.length > 0 && (
        <>
          <div className="space-y-3">
            {paged.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{m.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(m.date).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SourceBadge source={m.source_type} />
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                    {counts.get(m.id) ?? 0} items
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const isLive = source === "live";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isLive
          ? "bg-purple-900 text-purple-200"
          : "bg-slate-800 text-slate-300"
      }`}
    >
      {isLive ? "🔴 live" : "⬆️ upload"}
    </span>
  );
}
