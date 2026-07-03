"use client";

import { User, Plus } from "lucide-react";
import type { Channel } from "./types";
import UnreadBadge from "./UnreadBadge";

/** Direct-message conversations for the current user. */
export default function DMList({
  dms,
  selectedId,
  onSelect,
}: {
  dms: Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Direct messages</span>
        <button
          onClick={() => alert("New DM — coming with Member 1's chat tables.")}
          className="text-slate-500 hover:text-slate-200"
          aria-label="New DM"
        >
          <Plus size={14} />
        </button>
      </div>
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
