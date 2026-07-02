"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { CalendarEvent } from "../components/calendar/CalendarGrid";

const CalendarGrid = dynamic(() => import("../components/calendar/CalendarGrid"), {
  ssr: false,
  loading: () => <div className="h-[72vh] animate-pulse rounded-2xl bg-slate-900" />,
});

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    // Deadlines come from real item data. Rooms are best-effort (Member 1's
    // `rooms` table may not exist yet) — fetched but tolerated if absent.
    const itemsRes = await supabase
      .from("items")
      .select("id, text, deadline_iso, status")
      .not("deadline_iso", "is", null);

    if (itemsRes.error) {
      setError(itemsRes.error.message);
      setEvents([]);
      return;
    }

    const deadlineEvents: CalendarEvent[] = (itemsRes.data ?? []).map((it: {
      id: string; text: string; deadline_iso: string; status: string;
    }) => {
      const d = new Date(it.deadline_iso);
      return {
        id: it.id,
        title: it.text.length > 40 ? it.text.slice(0, 40) + "…" : it.text,
        start: d,
        end: d,
        kind: "deadline" as const,
        status: it.status,
        href: `/items/${it.id}`,
      };
    });

    let roomEvents: CalendarEvent[] = [];
    try {
      const roomsRes = await supabase
        .from("rooms")
        .select("id, jitsi_room_name, scheduled_time, meeting_id");
      if (!roomsRes.error && roomsRes.data) {
        roomEvents = roomsRes.data
          .filter((r: { scheduled_time: string | null }) => r.scheduled_time)
          .map((r: { id: string; jitsi_room_name: string | null; scheduled_time: string; meeting_id: string | null }) => {
            const d = new Date(r.scheduled_time);
            return {
              id: r.id,
              title: r.jitsi_room_name || "Meeting",
              start: d,
              end: new Date(d.getTime() + 60 * 60 * 1000),
              kind: "room" as const,
              href: r.meeting_id ? `/meetings/${r.meeting_id}` : "/calendar",
            };
          });
      }
    } catch {
      /* rooms table not ready — deadlines only */
    }

    setError(null);
    setEvents([...deadlineEvents, ...roomEvents]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Calendar</h1>
          <p className="mt-1 text-sm text-slate-400">
            Item deadlines and scheduled meetings. Click an event to open it.
          </p>
        </div>
        <Link
          href="/rooms/new"
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New room
        </Link>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-400">
        <Legend color="#2563eb" label="Meeting" />
        <Legend color="#475569" label="Deadline (open)" />
        <Legend color="#d97706" label="At risk" />
        <Legend color="#dc2626" label="Blocked" />
        <Legend color="#16a34a" label="Done" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-300">
          Failed to load calendar: {error}
          <button onClick={load} className="ml-3 rounded bg-red-800 px-3 py-1 text-red-100 hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {events === null && !error && <div className="h-[72vh] animate-pulse rounded-2xl bg-slate-900" />}

      {events && !error && <CalendarGrid events={events} />}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
