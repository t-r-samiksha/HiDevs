"use client";

import { useState } from "react";
import { User, Plus } from "lucide-react";
import type { Channel } from "./types";
import UnreadBadge from "./UnreadBadge";

type DirectoryUser = { id: string; name: string };

/** Direct-message conversations for the current user. */
export default function DMList({
  dms,
  selectedId,
  onSelect,
  directory,
  onCreateDM,
}: {
  dms: Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  directory: DirectoryUser[];
  onCreateDM: (userId: string, userName: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Direct messages</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-slate-500 hover:text-slate-200"
          aria-label="New DM"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Team-member picker (replaces the old browser prompt) */}
      {open && (
        <div className="mb-1 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-1">
          {directory.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-slate-500">No teammates to message.</p>
          ) : (
            directory.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onCreateDM(u.id, u.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800"
              >
                <User size={14} className="shrink-0 text-slate-500" />
                <span className="truncate">{u.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="space-y-0.5">
        {dms.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
              c.id === selectedId ? "bg-blue-600/15 text-blue-300" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <span className="shrink-0 text-slate-500"><User size={15} /></span>
            <span className="flex-1 truncate">{c.name}</span>
            <UnreadBadge count={c.unread} />
          </button>
        ))}
      </div>
    </div>
  );
}
