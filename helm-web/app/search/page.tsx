"use client";

import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import AnswerCard from "../components/search/AnswerCard";
import AskBar, { type SearchMode as Mode } from "../components/search/AskBar";
import SearchBar from "../components/search/SearchBar";
import SemanticResultsList, { type SearchResult as Result } from "../components/search/SemanticResultsList";
import { PROJECT_ID } from "../lib/project";

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
      if (mode === "ask") {
        // AI answer with citations (Member 1's ask agent).
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query, project_id: PROJECT_ID }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ask failed");
        setAnswer(typeof data.answer === "string" ? data.answer : null);
        setResults(
          (data.results || []).map((r: Partial<Result>) => ({
            text: r.text ?? "",
            type: r.type ?? "",
            owner: r.owner ?? "",
            meeting_title: r.meeting_title ?? "",
            source_quote: r.source_quote ?? "",
            supersedes_hint: "",
            trust_score: r.trust_score ?? 0,
            score: r.trust_score ?? 0,
          }))
        );
      } else {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search failed");
        setResults(data.results || []);
      }
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
      <div className="mb-3">
        <AskBar mode={mode} onChange={setMode} />
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <SearchBar query={query} onChange={setQuery} onSubmit={run} loading={loading} mode={mode} />
      </div>

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

          <SemanticResultsList results={filtered} />
        </div>
      </div>
    </div>
  );
}
