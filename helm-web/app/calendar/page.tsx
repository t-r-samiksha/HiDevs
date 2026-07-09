"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CalendarDays, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PROJECT_ID } from "../lib/project";
import type { CalendarEvent } from "../components/calendar/CalendarGrid";
import ReminderBell from "../components/calendar/ReminderBell";
import ReminderCreateModal from "../components/calendar/ReminderCreateModal";

const CalendarGrid = dynamic(() => import("../components/calendar/CalendarGrid"), {
  ssr: false,
  loading: () => <div className="h-[72vh] animate-pulse rounded-2xl bg-slate-900" />,
});

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminderItems, setReminderItems] = useState<{ id: string; text: string }[]>([]);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderRefresh, setReminderRefresh] = useState(0);

  // Schedule-meeting modal.
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [schedError, setSchedError] = useState<string | null>(null);

  async function scheduleMeeting() {
    if (!schedTitle.trim()) return setSchedError("Meeting title is required.");
    if (!schedTime) return setSchedError("Pick a date & time.");
    setScheduling(true);
    setSchedError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: PROJECT_ID,
          scheduled_time: schedTime,
          status: "scheduled",
          title: schedTitle.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not schedule the meeting.");
      setShowSchedule(false);
      setSchedTitle("");
      setSchedTime("");
      await load();
    } catch (e) {
      setSchedError(e instanceof Error ? e.message : "Failed to schedule.");
    } finally {
      setScheduling(false);
    }
  }

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
      const roomsRes = await supabase.from("rooms").select("*");
      if (!roomsRes.error && roomsRes.data) {
        roomEvents = roomsRes.data
          .filter((r: { scheduled_time: string | null }) => r.scheduled_time)
          .map((r: { id: string; jitsi_room_name: string | null; title?: string | null; scheduled_time: string; meeting_id: string | null }) => {
            const d = new Date(r.scheduled_time);
            return {
              id: r.id,
              title: r.title || r.jitsi_room_name || "Meeting",
              start: d,
              end: new Date(d.getTime() + 60 * 60 * 1000),
              kind: "room" as const,
              // Click a scheduled meeting → join its room (or open the meeting if it ended).
              href: r.meeting_id ? `/meetings/${r.meeting_id}` : `/rooms/${r.jitsi_room_name}`,
            };
          });
      }
    } catch {
      /* rooms table not ready — deadlines only */
    }

    setReminderItems((itemsRes.data ?? []).map((it: { id: string; text: string }) => ({ id: it.id, text: it.text })));
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
        <div className="flex shrink-0 items-center gap-2">
          <ReminderBell refreshKey={reminderRefresh} />
          <button
            onClick={() => setShowReminder(true)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            + Reminder
          </button>
          <button
            onClick={() => { setSchedError(null); setShowSchedule(true); }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Schedule meeting
          </button>
        </div>
      </div>

      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !scheduling && setShowSchedule(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Schedule a meeting</h2>
              <button onClick={() => !scheduling && setShowSchedule(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Meeting title</label>
                <input
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  placeholder="Sprint planning"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Date & time</label>
                <input
                  type="datetime-local"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {schedError && <p className="text-xs text-red-400">{schedError}</p>}
              <button
                onClick={scheduleMeeting}
                disabled={scheduling}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {scheduling ? "Scheduling…" : "Schedule meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReminder && (
        <ReminderCreateModal
          items={reminderItems}
          onClose={() => setShowReminder(false)}
          onCreated={() => setReminderRefresh((k) => k + 1)}
        />
      )}

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

      {events && events.length === 0 && !error && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <CalendarDays className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">Nothing scheduled</p>
          <p className="mt-1 text-sm text-slate-500">
            Item deadlines and meeting rooms will show up here once you have some.
          </p>
        </div>
      )}

      {events && events.length > 0 && !error && <CalendarGrid events={events} />}
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
