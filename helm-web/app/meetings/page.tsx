"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Video, CalendarPlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import MeetingHistoryList from "../components/meetings/MeetingHistoryList";

type Meeting = {
  id: string;
  title: string;
  date: string;
  source_type: string | null;
  created_at: string;
};
type Project = { id: string; name: string };

const PAGE_SIZE = 10;

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Host / schedule meeting modal.
  const [projects, setProjects] = useState<Project[]>([]);
  const [modalMode, setModalMode] = useState<"host" | "schedule" | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [formTime, setFormTime] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  function openModal(mode: "host" | "schedule") {
    setModalMode(mode);
    setFormTitle("");
    setFormTime("");
    setModalError(null);
    setFormProjectId((prev) => prev || projects[0]?.id || "");
  }

  async function createRoom() {
    if (!formTitle.trim()) {
      setModalError("Meeting title is required.");
      return;
    }
    if (modalMode === "schedule" && !formTime) {
      setModalError("Pick a date & time to schedule.");
      return;
    }
    setCreating(true);
    setModalError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const startNow = modalMode === "host";
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: formProjectId || projects[0]?.id || null,
          scheduled_time: startNow ? null : formTime,
          status: startNow ? "live" : "scheduled",
          created_by: user?.id ?? null,
          title: formTitle.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.jitsi_room_name) {
        throw new Error(data.error || "Could not create the room.");
      }
      // Mark this browser as host so recording auto-starts on the room page.
      try {
        localStorage.setItem(`helm_host_${data.jitsi_room_name}`, "1");
      } catch {
        /* ignore */
      }
      if (startNow) {
        router.push(`/rooms/${data.jitsi_room_name}`);
      } else {
        setModalMode(null);
        setError(null);
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Failed to create room.");
    } finally {
      setCreating(false);
    }
  }

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
    supabase
      .from("projects")
      .select("id, name")
      .then(({ data }) => {
        const list = (data as Project[]) ?? [];
        setProjects(list);
        setFormProjectId((prev) => prev || list[0]?.id || "");
      });
  }, []);

  const total = meetings?.length ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const paged = (meetings ?? []).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Meetings</h1>
          <p className="mt-1 text-sm text-slate-400">All processed meetings, newest first.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => openModal("host")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Video size={15} /> Host meeting
          </button>
          <button
            onClick={() => openModal("schedule")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            <CalendarPlus size={15} /> Schedule
          </button>
        </div>
      </div>

      {/* Host / schedule modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !creating && setModalMode(null)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                {modalMode === "host" ? "Host a meeting now" : "Schedule a meeting"}
              </h2>
              <button onClick={() => !creating && setModalMode(null)} className="text-slate-500 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Meeting title</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Sprint planning"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {projects.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Project</label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {modalMode === "schedule" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Date & time</label>
                  <input
                    type="datetime-local"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {modalError && <p className="text-xs text-red-400">{modalError}</p>}
              <button
                onClick={createRoom}
                disabled={creating}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : modalMode === "host" ? "Start & join now" : "Schedule meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <MeetingHistoryList meetings={paged} counts={counts} />

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

