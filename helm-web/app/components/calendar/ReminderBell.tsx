"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Reminder = { id: string; message: string; remind_at: string };

/**
 * Shows the count of upcoming (unsent, future) reminders for the current user
 * and lists them in a dropdown. Reads the `reminders` table; degrades to 0 if
 * the table isn't there yet. `refreshKey` re-fetches when a reminder is added.
 */
export default function ReminderBell({ refreshKey = 0 }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await supabase
          .from("reminders")
          .select("id, message, remind_at")
          .eq("sent", false)
          .gte("remind_at", new Date().toISOString())
          .order("remind_at", { ascending: true });
        if (!active || error) return;
        setReminders((data as Reminder[]) ?? []);
      } catch {
        /* table not ready */
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
        aria-label="Upcoming reminders"
      >
        <Bell size={18} />
        {reminders.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
            {reminders.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          <div className="border-b border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200">Upcoming reminders</div>
          {reminders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No upcoming reminders.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {reminders.map((r) => (
                <li key={r.id} className="border-b border-slate-800 px-4 py-3 last:border-0">
                  <p className="text-sm text-slate-200">{r.message}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(r.remind_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
