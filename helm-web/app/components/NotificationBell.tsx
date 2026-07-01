"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Notice = { id: string; text: string; href?: string };

/**
 * Topbar notification bell. For now it surfaces items that need attention
 * (pending review / quarantined) as a lightweight notification feed.
 * TODO: Replace with a real notifications source when Member 1 adds one.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await supabase
          .from("items")
          .select("id, text, review_state")
          .in("review_state", ["pending_review", "quarantined"]);
        if (!active || !data) return;
        setNotices(
          data.map((i) => ({
            id: i.id,
            text: `Needs review: ${i.text}`,
            href: "/review",
          }))
        );
      } catch {
        /* ignore */
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  // Close on outside click.
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
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {notices.length > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          <div className="border-b border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200">
            Notifications
          </div>
          {notices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notices.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <a
                    href={n.href}
                    className="block border-b border-slate-800 px-4 py-3 text-sm text-slate-300 last:border-0 hover:bg-slate-800"
                  >
                    {n.text}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
