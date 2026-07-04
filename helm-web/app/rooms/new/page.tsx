"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Project = { id: string; name: string };

// Fallback name used only if the rooms API is unreachable — the room still
// works via public Jitsi even without a persisted `rooms` row in that case.
function slugRoom(title: string) {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meeting";
  return `helm-${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function NewRoomPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase
      .from("projects")
      .select("id, name")
      .then(({ data }) => {
        const list = (data as Project[]) ?? [];
        setProjects(list);
        if (list[0]) setProjectId(list[0].id);
      });
  }, []);

  async function create(startNow: boolean) {
    if (!title.trim()) return;
    setCreating(true);

    // The server is the source of truth for the room name — join whatever
    // name it actually persisted, so the `rooms` row always matches the real
    // Jitsi room (previously the client joined its own name while the server
    // silently generated a different one, so calendar/workspace lookups for
    // that room never resolved).
    let roomName = slugRoom(title);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId || null,
          scheduled_time: startNow ? null : scheduledTime || null,
          status: startNow ? "live" : "scheduled",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jitsi_room_name) roomName = data.jitsi_room_name;
      }
    } catch {
      /* API unreachable — fall back to the locally-generated name so the room still works */
    }

    if (startNow) {
      router.push(`/rooms/${roomName}`);
    } else {
      alert("Meeting scheduled — it will appear on the calendar.");
      router.push("/calendar");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:px-6">
      <Link href="/calendar" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Calendar
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-white">New meeting room</h1>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <Field label="Meeting title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sprint planning"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>

        {projects.length > 0 && (
          <Field label="Project">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Schedule for (optional)">
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => create(true)}
            disabled={creating || !title.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Start now
          </button>
          <button
            onClick={() => create(false)}
            disabled={creating || !title.trim() || !scheduledTime}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}
