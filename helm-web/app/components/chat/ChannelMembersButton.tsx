"use client";

import { useState } from "react";
import { Users } from "lucide-react";

/** Small pill in the channel header — click to see who's in the channel. */
export default function ChannelMembersButton({ members }: { members: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
      >
        <Users size={12} />
        {members.length}
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-56 w-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2 shadow-lg">
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
            {members.map((name, i) => (
              <div key={i} className="truncate rounded px-1.5 py-1 text-sm text-slate-300">
                {name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
