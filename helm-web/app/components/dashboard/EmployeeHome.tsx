"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CalendarClock, Mic, Search, MessageSquare, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import StatusPill from "../StatusPill";
import TrustScoreBadge from "../TrustScoreBadge";

type Item = {
  id: string;
  text: string;
  owner: string | null;
  status: string;
  trust_score: number;
  deadline_iso: string | null;
  deadline_raw: string | null;
  meeting_id: string | null;
};
type Meeting = { id: string; title: string; date: string; created_at: string };

const DAY = 24 * 60 * 60 * 1000;

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / DAY);
}

/**
 * Personal workspace shown at `/` for employees (and for managers who toggle to
 * the Personal view). Same dark theme + StatusPill/TrustScoreBadge as the rest
 * of the app — a task manager, not a stripped-down dashboard.
 */
export default function EmployeeHome({ userName }: { userName: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const [itemsRes, meetingsRes] = await Promise.all([
      supabase
        .from("items")
        .select("id, text, owner, status, trust_score, deadline_iso, deadline_raw, meeting_id")
        .ilike("owner", userName)
        .order("deadline_iso", { ascending: true, nullsFirst: false }),
      supabase.from("meetings").select("id, title, date, created_at").order("created_at", { ascending: false }).limit(5),
    ]);
    setItems((itemsRes.data as Item[]) ?? []);
    setMeetings((meetingsRes.data as Meeting[]) ?? []);
  }, [userName]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function markDone(id: string) {
    // Optimistic — then persist.
    setItems((prev) => (prev ? prev.map((i) => (i.id === id ? { ...i, status: "done" } : i)) : prev));
    await fetch(`/api/items/${id}/complete`, { method: "POST" }).catch(() => {});
  }

  const meetingTitle = new Map(meetings.map((m) => [m.id, m.title]));
  const list = items ?? [];
  const open = list.filter((i) => ["open", "in_progress"].includes(i.status));
  const inProgress = list.filter((i) => i.status === "in_progress");
  const notStarted = list.filter((i) => i.status === "open");
  const atRisk = list.filter((i) => ["at_risk", "blocked"].includes(i.status));
  const done = list.filter((i) => i.status === "done");
  const dueThisWeek = list.filter(
    (i) => i.deadline_iso && i.status !== "done" && daysUntil(i.deadline_iso) >= 0 && daysUntil(i.deadline_iso) <= 7
  );
  const upcoming = list
    .filter((i) => i.deadline_iso && i.status !== "done" && daysUntil(i.deadline_iso!) <= 14)
    .slice(0, 8);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (items === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-6 h-16 animate-pulse rounded-2xl bg-slate-900" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-white">
          Welcome back, {userName || "there"}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">{today}</p>
      </div>

      {/* Section 1: Quick stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open tasks" value={open.length} tone="text-slate-100" />
        <Stat label="Due this week" value={dueThisWeek.length} tone="text-blue-300" />
        <Stat label="At risk" value={atRisk.length} tone="text-amber-300" />
        <Stat label="Completed" value={done.length} tone="text-emerald-300" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Section 2: My tasks (main) */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">My tasks</h2>

          {list.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 py-12 text-center text-sm text-slate-500">
              No action items assigned to you yet.
            </div>
          )}

          <TaskGroup title="At risk" accent="border-l-red-500" items={atRisk} meetingTitle={meetingTitle} onDone={markDone} />
          <TaskGroup title="In progress" accent="border-l-blue-500" items={inProgress} meetingTitle={meetingTitle} onDone={markDone} />
          <TaskGroup title="Open" accent="border-l-slate-600" items={notStarted} meetingTitle={meetingTitle} onDone={markDone} />

          {done.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowDone((v) => !v)} className="text-xs text-slate-400 hover:text-slate-200">
                {showDone ? "▾" : "▸"} Completed ({done.length})
              </button>
              {showDone && (
                <div className="mt-2">
                  <TaskGroup title="" accent="border-l-emerald-600" items={done} meetingTitle={meetingTitle} onDone={markDone} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Section 3: Upcoming deadlines */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              <CalendarClock size={15} /> Upcoming deadlines
            </h2>
            <div className="space-y-1.5">
              {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing due in the next 2 weeks.</p>}
              {upcoming.map((i) => {
                const d = daysUntil(i.deadline_iso!);
                const tone = d < 0 ? "text-red-400" : d <= 3 ? "text-amber-400" : "text-emerald-400";
                const when = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "today" : `in ${d}d`;
                return (
                  <Link key={i.id} href={`/items/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:border-slate-600">
                    <span className="min-w-0 flex-1 truncate text-slate-300">{i.text}</span>
                    <span className={`shrink-0 text-xs font-medium ${tone}`}>{when}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Section 4: My recent meetings */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              <Mic size={15} /> Recent meetings
            </h2>
            <div className="space-y-1.5">
              {meetings.length === 0 && <p className="text-sm text-slate-500">No meetings yet.</p>}
              {meetings.map((m) => (
                <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:border-slate-600">
                  <span className="min-w-0 flex-1 truncate text-slate-300">{m.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">{new Date(m.date || m.created_at).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Section 5: Quick actions */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Quick actions</h2>
            <div className="space-y-2">
              <QuickAction href="/meetings" icon={<Video size={16} />} label="Join or host a meeting" />
              <QuickAction href="/search" icon={<Search size={16} />} label="Search across meetings" />
              <QuickAction href="/chat" icon={<MessageSquare size={16} />} label="Open chat" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
      <div className={`font-mono text-[26px] font-semibold leading-none tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function TaskGroup({
  title,
  accent,
  items,
  meetingTitle,
  onDone,
}: {
  title: string;
  accent: string;
  items: Item[];
  meetingTitle: Map<string, string>;
  onDone: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      {title && <h3 className="mb-2 text-xs font-medium text-slate-500">{title} ({items.length})</h3>}
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className={`rounded-xl border border-slate-800 border-l-4 bg-slate-900 p-3 ${accent}`}>
            <div className="flex items-start justify-between gap-3">
              <Link href={`/items/${i.id}`} className="min-w-0 flex-1 text-sm text-slate-100 hover:underline">
                {i.text}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill status={i.status} />
                <TrustScoreBadge score={i.trust_score} />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-slate-500">
                {i.deadline_raw || (i.deadline_iso ? new Date(i.deadline_iso).toLocaleDateString() : "no deadline")}
                {i.meeting_id && meetingTitle.get(i.meeting_id) ? ` · from “${meetingTitle.get(i.meeting_id)}”` : ""}
              </span>
              {i.status !== "done" && (
                <button
                  onClick={() => onDone(i.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <CheckCircle2 size={13} /> Mark done
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 hover:border-slate-600">
      <span className="text-blue-400">{icon}</span>
      {label}
    </Link>
  );
}
