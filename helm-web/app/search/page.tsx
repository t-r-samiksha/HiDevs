"use client";

import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import TrustScoreBadge from "../components/TrustScoreBadge";
import AnswerCard from "../components/search/AnswerCard";

type Result = {
  text: string;
  type: string;
  owner: string;
  meeting_title: string;
  source_quote: string;
  supersedes_hint: string;
  trust_score: number;
  score: number;
};

type Mode = "search" | "ask";
type TypeFilter = "all" | "decision" | "action_item";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("search");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [results, setResults] = useState<Result[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results || []);
      // The ask agent (Member 1) will eventually return `answer`. Until then
      // Ask mode just shows semantic results with a heads-up banner.
      setAnswer(typeof data.answer === "string" ? data.answer : null);
      setRan(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const filtered =
    typeFilter === "all" ? results : results.filter((r) => r.type === typeFilter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Search</h1>
        <p className="mt-1 text-sm text-slate-400">
          Semantic search across every meeting. Switch to Ask for a synthesized answer.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="mb-3 inline-flex rounded-lg border border-slate-800 bg-slate-900 p-1">
        {(["search", "ask"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              mode === m ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <form onSubmit={run} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
        {/* Filter sidebar */}
        <aside className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Type</p>
            <div className="space-y-1">
              {(["all", "decision", "action_item"] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm capitalize transition-colors ${
                    typeFilter === t ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  {t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          {/* TODO: project + date-range ("time travel") filters once the search
              API returns project_id and meeting date in result metadata. */}
          <p className="text-xs text-slate-600">
            Project &amp; date filters arrive once search results include those fields.
          </p>
        </aside>

        {/* Results */}
        <div>
          {mode === "ask" && ran && !answer && (
            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
              ✨ AI answers are coming soon — showing the most relevant items for now.
            </div>
          )}
          {answer && <AnswerCard answer={answer} />}

          {error && (
            <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-300">{error}</div>
          )}

          {!ran && !error && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
              <SearchIcon className="mx-auto mb-3 text-slate-600" size={40} />
              <p className="text-slate-400">Search across all your meetings.</p>
            </div>
          )}

          {ran && !error && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No matching results.</p>
          )}

          <div className="space-y-3">
            {filtered.map((r, i) => (
              <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-sm text-white">{r.text}</p>
                  <span className="shrink-0 font-mono text-xs text-blue-400">{r.score}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{r.type === "decision" ? "📌 decision" : "📋 action item"}</span>
                  {r.owner && r.owner !== "unassigned" && <span>👤 {r.owner}</span>}
                  {r.meeting_title && <span>🎙️ {r.meeting_title}</span>}
                  <TrustScoreBadge score={r.trust_score} />
                </div>
                {r.source_quote && (
                  <p className="mt-2 border-l-2 border-slate-700 pl-2 text-xs italic text-slate-500">
                    &quot;{r.source_quote}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
