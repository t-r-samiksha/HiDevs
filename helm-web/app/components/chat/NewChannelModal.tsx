"use client";

import { useState } from "react";
import { X, Search, Check } from "lucide-react";

type DirectoryUser = { id: string; name: string; email?: string };

/** Modal for creating a channel and picking who's in it. */
export default function NewChannelModal({
  directory,
  onClose,
  onCreate,
}: {
  directory: DirectoryUser[];
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = directory.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const username = u.email?.split("@")[0] ?? "";
    return (
      u.name.toLowerCase().includes(q) ||
      username.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, Array.from(selected));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">New channel</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Channel name"
          className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-600 focus:outline-none"
        />

        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Add members{selected.size > 0 && ` (${selected.size})`}
        </p>
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <Search size={13} className="shrink-0 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username..."
            className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
          />
        </div>

        <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-slate-800">
          {directory.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-500">
              No teammates loaded yet — try reopening chat.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-500">No matches for &quot;{query}&quot;.</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected.has(u.id) ? "border-blue-500 bg-blue-600" : "border-slate-600"
                  }`}
                >
                  {selected.has(u.id) && <Check size={11} className="text-white" />}
                </span>
                <span className="truncate">{u.name}</span>
              </button>
            ))
          )}
        </div>

        <p className="mb-3 text-xs text-slate-500">
          {selected.size === 0
            ? "Leave everyone unchecked to make this an open channel visible to the whole workspace."
            : "Only you and the people you check will be able to see this channel."}
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
