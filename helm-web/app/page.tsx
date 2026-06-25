"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Item = {
  id: string;
  type: "decision" | "action_item";
  text: string;
  owner: string | null;
  deadline_raw: string | null;
  status: string;
  trust_score: number;
  review_state: string;
  dependency_hints: string[];
  supersedes_hint: string | null;
  source_quote: string | null;
  meeting_id: string;
  created_at: string;
};

type Meeting = {
  id: string;
  title: string;
  date: string;
  created_at: string;
};

type Contradiction = {
  id: string;
  item_a_id: string;
  item_b_id: string;
  description: string;
  detected_at: string;
};

// ---------------------------------------------------------------------------
// Status pill colors
// ---------------------------------------------------------------------------
const statusStyles: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  at_risk: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const trustColor = (score: number) => {
  if (score >= 0.85)
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (score >= 0.6)
    return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchDone(false);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchDone(true);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    async function fetchData() {
      const [itemsRes, meetingsRes, contradictionsRes] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("meetings")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("contradictions")
          .select("*")
          .order("detected_at", { ascending: false }),
      ]);

      setItems(itemsRes.data || []);
      setMeetings(meetingsRes.data || []);
      setContradictions(contradictionsRes.data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-lg">Loading Helm...</p>
      </div>
    );
  }

  // Computed stats
  const actionItems = items.filter((i) => i.type === "action_item");
  const decisions = items.filter((i) => i.type === "decision");
  const atRisk = actionItems.filter((i) => i.status === "at_risk");
  const blocked = actionItems.filter((i) => i.status === "blocked");
  const done = actionItems.filter((i) => i.status === "done");
  const needsReview = items.filter((i) => i.review_state === "pending_review");
  const quarantined = items.filter((i) => i.review_state === "quarantined");

  // Meeting title lookup
  const meetingMap = new Map(meetings.map((m) => [m.id, m.title]));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <span className="text-blue-700 dark:text-blue-300 text-lg">
                ⎈
              </span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Helm
            </h1>
          </div>
          {/* <div className="text-sm text-gray-500 dark:text-gray-400">
            {meetings.length} meetings · {items.length} items tracked
          </div> */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {meetings.length} meetings · {items.length} items tracked
            </span>

            <a
              href="/upload"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Upload transcript
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Greeting */}
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {actionItems.length} action items across {meetings.length} meetings.
          {atRisk.length > 0 && ` ${atRisk.length} at risk.`}
          {blocked.length > 0 && ` ${blocked.length} blocked.`}
          {needsReview.length > 0 && ` ${needsReview.length} need review.`}
        </p>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask across meetings... e.g. 'Why did we switch databases?'"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {searching ? "Searching..." : "Ask"}
            </button>
          </div>
        </form>

        {/* Search results */}
        {searchDone && (
          <div className="mb-8 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Results for &quot;{searchQuery}&quot;
              </h3>
              <button
                onClick={() => {
                  setSearchDone(false);
                  setSearchResults([]);
                  setSearchQuery("");
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear
              </button>
            </div>
            {searchResults.length === 0 ? (
              <p className="text-sm text-blue-700 dark:text-blue-300">
                No results found.
              </p>
            ) : (
              <div className="space-y-3">
                {searchResults.map((r, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-900"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm text-gray-900 dark:text-white">
                        {r.text}
                      </p>
                      <span className="shrink-0 text-xs text-blue-600 dark:text-blue-400 font-mono">
                        {r.score}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {r.type === "decision" ? "📌" : "📋"} {r.type}
                      </span>
                      {r.owner !== "unassigned" && <span>👤 {r.owner}</span>}
                      <span>🎙️ {r.meeting_title}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full ${trustColor(r.trust_score)}`}
                      >
                        🛡️ {r.trust_score}
                      </span>
                    </div>
                    {r.supersedes_hint && (
                      <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                        ↩️ {r.supersedes_hint}
                      </p>
                    )}
                    {r.source_quote && (
                      <p className="text-xs mt-1 italic text-gray-400 dark:text-gray-500 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                        &quot;{r.source_quote}&quot;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <MetricCard label="Action items" value={actionItems.length} />
          <MetricCard label="Decisions" value={decisions.length} />
          <MetricCard
            label="At risk"
            value={atRisk.length}
            color={atRisk.length > 0 ? "amber" : undefined}
          />
          <MetricCard
            label="Blocked"
            value={blocked.length}
            color={blocked.length > 0 ? "red" : undefined}
          />
          <MetricCard
            label="Completed"
            value={done.length}
            color={done.length > 0 ? "green" : undefined}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — items */}
          <div className="lg:col-span-2 space-y-4">
            <SectionTitle icon="📋" title="Action items" />
            {actionItems.length === 0 && (
              <EmptyState text="No action items yet" />
            )}
            {actionItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                meetingTitle={meetingMap.get(item.meeting_id)}
              />
            ))}

            <div className="pt-4">
              <SectionTitle icon="📌" title="Decisions" />
              {decisions.length === 0 && <EmptyState text="No decisions yet" />}
              {decisions.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  meetingTitle={meetingMap.get(item.meeting_id)}
                />
              ))}
            </div>
          </div>

          {/* Right column — risk + contradictions */}
          <div className="space-y-6">
            {/* Quarantined items */}
            {quarantined.length > 0 && (
              <div>
                <SectionTitle icon="🔴" title="Quarantined (low trust)" />
                {quarantined.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    meetingTitle={meetingMap.get(item.meeting_id)}
                  />
                ))}
              </div>
            )}

            {/* Needs review */}
            {needsReview.length > 0 && (
              <div>
                <SectionTitle icon="🟡" title="Needs review" />
                {needsReview.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    meetingTitle={meetingMap.get(item.meeting_id)}
                  />
                ))}
              </div>
            )}

            {/* Contradictions */}
            <div>
              <SectionTitle
                icon="⚠️"
                title={`Contradictions (${contradictions.length})`}
              />
              {contradictions.length === 0 && (
                <EmptyState text="No contradictions detected" />
              )}
              {contradictions.map((c) => (
                <div
                  key={c.id}
                  className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-3"
                >
                  <p className="text-sm text-amber-900 dark:text-amber-200">
                    {c.description}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Detected {new Date(c.detected_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Meetings */}
            <div>
              <SectionTitle icon="🎙️" title="Meetings" />
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-3"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {m.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(m.date).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "amber" | "red" | "green";
}) {
  const valueColor =
    color === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : color === "red"
        ? "text-red-600 dark:text-red-400"
        : color === "green"
          ? "text-green-600 dark:text-green-400"
          : "text-gray-900 dark:text-white";

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-3">
      <span>{icon}</span> {title}
    </h2>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-sm text-gray-400 dark:text-gray-600 py-4">{text}</p>
  );
}

function ItemCard({
  item,
  meetingTitle,
}: {
  item: Item;
  meetingTitle?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
      {/* Top row — text + status */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-gray-900 dark:text-white leading-relaxed">
          {item.text}
        </p>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusStyles[item.status] || statusStyles.open}`}
        >
          {item.status.replace("_", " ")}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {item.owner && (
          <span className="flex items-center gap-1">👤 {item.owner}</span>
        )}
        {item.deadline_raw && (
          <span className="flex items-center gap-1">
            🕐 {item.deadline_raw}
          </span>
        )}
        {meetingTitle && (
          <span className="flex items-center gap-1">🎙️ {meetingTitle}</span>
        )}
        {/* Trust badge */}
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${trustColor(item.trust_score)}`}
        >
          🛡️ {item.trust_score}
        </span>
      </div>

      {/* Dependency hints */}
      {item.dependency_hints && item.dependency_hints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.dependency_hints.map((hint, i) => (
            <span
              key={i}
              className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full"
            >
              🔗 {hint}
            </span>
          ))}
        </div>
      )}

      {/* Supersede hint */}
      {item.supersedes_hint && (
        <div className="mt-2">
          <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
            ↩️ {item.supersedes_hint}
          </span>
        </div>
      )}

      {/* Source quote (collapsed) */}
      {item.source_quote && (
        <details className="mt-2">
          <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600">
            Show source quote
          </summary>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic border-l-2 border-gray-200 dark:border-gray-700 pl-2">
            &quot;{item.source_quote}&quot;
          </p>
        </details>
      )}
    </div>
  );
}
