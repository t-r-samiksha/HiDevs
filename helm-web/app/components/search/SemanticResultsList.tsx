import TrustScoreBadge from "../TrustScoreBadge";

export type SearchResult = {
  text: string;
  type: string;
  owner: string;
  meeting_title: string;
  source_quote: string;
  supersedes_hint: string;
  trust_score: number;
  score: number;
};

/** List of semantic search result cards. */
export default function SemanticResultsList({ results }: { results: SearchResult[] }) {
  return (
    <div className="space-y-3">
      {results.map((r, i) => (
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
  );
}
