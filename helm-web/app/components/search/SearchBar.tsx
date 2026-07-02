"use client";

import { Search as SearchIcon } from "lucide-react";
import type { SearchMode } from "./AskBar";

/** Search input + submit button. */
export default function SearchBar({
  query,
  onChange,
  onSubmit,
  loading,
  mode,
}: {
  query: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  mode: SearchMode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={mode === "ask" ? "Ask a question… e.g. 'Why did we switch databases?'" : "Search decisions and action items…"}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "…" : mode === "ask" ? "Ask" : "Search"}
      </button>
    </form>
  );
}
