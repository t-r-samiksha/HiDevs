"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import StatusPill from "./components/StatusPill";
import TrustScoreBadge from "./components/TrustScoreBadge";
import AnswerCard from "./components/search/AnswerCard";
import BriefingDigest from "./components/dashboard/BriefingDigest";
import ApprovalQueueWidget from "./components/dashboard/ApprovalQueueWidget";
import InsightCard, { type Insight } from "./components/dashboard/InsightCard";
import DashboardCharts from "./components/dashboard/DashboardCharts";

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

type Meeting = { id: string; title: string; date: string; created_at: string };
type Contradiction = { id: string; item_a_id: string; item_b_id: string; description: string; detected_at: string };
type SearchResult = {
  text: string;
  type: string;
  owner: string;
  meeting_title: string;
  source_quote: string;
  supersedes_hint: string;
  trust_score: number;
  score: number;
};
type ScanResult = { evaluated?: number; transitions?: unknown[] };

// Priority order for the action-item list: blocked → at_risk → open → in_progress → done.
const STATUS_RANK: Record<string, number> = { blocked: 0, at_risk: 1, open: 2, in_progress: 3, done: 4 };

// Single hardcoded project until the pipeline supports real multi-project selection.
const PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [pendingFollowups, setPendingFollowups] = useState(0);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchAnswer, setSearchAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchDone(false);
    setSearchAnswer(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, mode: "ask" }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchAnswer(typeof data.answer === "string" ? data.answer : null);
      setSearchDone(true);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  }

  async function handleRiskScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/risk-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setScanResult(data);
      const { data: refreshed } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (refreshed) setItems(refreshed);
    } catch (err) {
      console.error("Risk scan failed:", err);
    } finally {
      setScanning(false);
    }
  }

  async function handleDraftFollowup(itemId: string) {
    setDraftingId(itemId);
    try {
      const res = await fetch("/api/followup/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      const data = await res.json();
      if (data.escalation_id) {
        setPendingFollowups((c) => c + 1);
        alert(`Follow-up drafted for ${data.owner}!\n\n"${data.draft}"\n\nGo to the Approval Queue to approve or reject.`);
      } else {
        alert("Failed to draft: " + (data.error || "unknown error"));
      }
    } catch (err) {
      console.error("Draft failed:", err);
    } finally {
      setDraftingId(null);
    }
  }

  async function loadData() {
    const [itemsRes, meetingsRes, contradictionsRes, followupRes] = await Promise.all([
      supabase.from("items").select("*").order("created_at", { ascending: false }),
      supabase.from("meetings").select("*").order("created_at", { ascending: false }),
      supabase.from("contradictions").select("*").order("detected_at", { ascending: false }),
      supabase.from("escalation_logs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setItems(itemsRes.data || []);
    setMeetings(meetingsRes.data || []);
    setContradictions(contradictionsRes.data || []);
    setPendingFollowups(followupRes.count ?? 0);

    // Strategic signals — real 5-engine detector, scoped to the current project.
    try {
      const res = await fetch(`/api/dashboard/insights?project_id=${PROJECT_ID}`);
      if (res.ok) {
        const data = await res.json();
        const raw = data.insights ?? data.signals ?? [];
        setInsights(
          raw.map((s: Record<string, unknown>, i: number) => ({
            id: (s.id as string) ?? `${s.type ?? "signal"}-${i}`,
            text: (s.text as string) ?? `${s.title ?? ""}${s.title && s.description ? " — " : ""}${s.description ?? ""}`,
            actionLabel: (s.actionLabel as string) ?? (s.action_label as string) ?? undefined,
            actionHref: s.actionHref as string | undefined,
          }))
        );
      }
    } catch (err) {
      console.error("Insights fetch failed:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 h-24 animate-pulse rounded-2xl bg-slate-900" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  // Derived
  const actionItems = items
    .filter((i) => i.type === "action_item")
    .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));
  const decisions = items.filter((i) => i.type === "decision");
  const atRisk = actionItems.filter((i) => i.status === "at_risk");
  const blocked = actionItems.filter((i) => i.status === "blocked");
  const done = actionItems.filter((i) => i.status === "done");
  const needsReview = items.filter((i) => i.review_state === "pending_review");
  const quarantined = items.filter((i) => i.review_state === "quarantined");
  const meetingMap = new Map(meetings.map((m) => [m.id, m.title]));

  const briefing =
    `Good day. You have ${actionItems.length} action items across ${meetings.length} meetings. ` +
    `${blocked.length} blocked, ${atRisk.length} at risk, ${done.length} completed. ` +
    `${needsReview.length + quarantined.length} items need review. ` +
    `${pendingFollowups} follow-up${pendingFollowups !== 1 ? "s" : ""} awaiting approval.`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Link href="/review" className="relative rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            Review queue
            {needsReview.length + quarantined.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-900 px-1.5 py-0.5 text-xs font-semibold text-amber-200">
                {needsReview.length + quarantined.length}
              </span>
            )}
          </Link>
          <Link href="/upload" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            + Upload transcript
          </Link>
        </div>
      </div>

      {/* Briefing + voice */}
      <BriefingDigest summary={briefing} />

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Ask across meetings… e.g. 'Why did we switch databases?'"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" disabled={searching} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {searching ? "Searching…" : "Ask"}
        </button>
      </form>

      {/* Search results */}
      {searchDone && (
        <div className="mb-8">
          {searchAnswer && <AnswerCard answer={searchAnswer} />}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Results for &quot;{searchQuery}&quot;</h3>
              <button onClick={() => { setSearchDone(false); setSearchResults([]); setSearchAnswer(null); setSearchQuery(""); }} className="text-xs text-blue-400 hover:underline">
                Clear
              </button>
            </div>
            {searchResults.length === 0 ? (
              <p className="text-sm text-slate-500">No results found.</p>
            ) : (
              <div className="space-y-3">
                {searchResults.map((r, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="text-sm text-white">{r.text}</p>
                      <span className="shrink-0 font-mono text-xs text-blue-400">{r.score}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                      <span>{r.type === "decision" ? "📌" : "📋"} {r.type}</span>
                      {r.owner !== "unassigned" && <span>👤 {r.owner}</span>}
                      <span>🎙️ {r.meeting_title}</span>
                      <TrustScoreBadge score={r.trust_score} />
                    </div>
                    {r.source_quote && (
                      <p className="mt-1 border-l-2 border-slate-700 pl-2 text-xs italic text-slate-500">&quot;{r.source_quote}&quot;</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metric cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Action items" value={actionItems.length} />
        <MetricCard label="Decisions" value={decisions.length} />
        <MetricCard label="At risk" value={atRisk.length} color={atRisk.length ? "amber" : undefined} />
        <MetricCard label="Blocked" value={blocked.length} color={blocked.length ? "red" : undefined} />
        <MetricCard label="Completed" value={done.length} color={done.length ? "green" : undefined} />
      </div>

      {/* Charts */}
      <DashboardCharts items={items} />

      {/* Approval widget + risk scan */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ApprovalQueueWidget count={pendingFollowups} />
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <button
            onClick={handleRiskScan}
            disabled={scanning}
            className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 hover:bg-amber-950 disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "⚡ Run risk scan"}
          </button>
          {scanResult && (
            <span className="text-xs text-slate-400">
              Evaluated {scanResult.evaluated} · {scanResult.transitions?.length || 0} changes
            </span>
          )}
        </div>
      </div>

      {/* Strategic signals */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-slate-400">📈 Strategic signals</h2>
        {insights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
            No signals yet — check back after a few more meetings are processed.
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map((s) => <InsightCard key={s.id} insight={s} />)}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <SectionTitle icon="📋" title="Action items" />
          {actionItems.length === 0 && <EmptyState text="No action items yet" />}
          {actionItems.map((item) => (
            <ItemCard key={item.id} item={item} meetingTitle={meetingMap.get(item.meeting_id)} onDraftFollowup={handleDraftFollowup} draftingId={draftingId} />
          ))}

          <div className="pt-4">
            <SectionTitle icon="📌" title="Decisions" />
            {decisions.length === 0 && <EmptyState text="No decisions yet" />}
            {decisions.map((item) => (
              <ItemCard key={item.id} item={item} meetingTitle={meetingMap.get(item.meeting_id)} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {quarantined.length > 0 && (
            <div>
              <SectionTitle icon="🔴" title="Quarantined (low trust)" />
              {quarantined.map((item) => <ItemCard key={item.id} item={item} meetingTitle={meetingMap.get(item.meeting_id)} />)}
            </div>
          )}
          {needsReview.length > 0 && (
            <div>
              <SectionTitle icon="🟡" title="Needs review" />
              {needsReview.map((item) => <ItemCard key={item.id} item={item} meetingTitle={meetingMap.get(item.meeting_id)} />)}
            </div>
          )}
          <div>
            <SectionTitle icon="⚠️" title={`Contradictions (${contradictions.length})`} />
            {contradictions.length === 0 && <EmptyState text="No contradictions detected" />}
            {contradictions.map((c) => (
              <div key={c.id} className="mb-3 rounded-xl border border-amber-800 bg-amber-950 p-4">
                <p className="text-sm text-amber-200">{c.description}</p>
                <p className="mt-1 text-xs text-amber-400">Detected {new Date(c.detected_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
          <div>
            <SectionTitle icon="🎙️" title="Meetings" />
            {meetings.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="mb-3 block rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600">
                <p className="text-sm font-medium text-white">{m.title}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(m.date).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function MetricCard({ label, value, color }: { label: string; value: number; color?: "amber" | "red" | "green" }) {
  const valueColor =
    color === "amber" ? "text-amber-400" : color === "red" ? "text-red-400" : color === "green" ? "text-green-400" : "text-white";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-400">
      <span>{icon}</span> {title}
    </h2>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-4 text-sm text-slate-600">{text}</p>;
}

function ItemCard({
  item,
  meetingTitle,
  onDraftFollowup,
  draftingId,
}: {
  item: Item;
  meetingTitle?: string;
  onDraftFollowup?: (id: string) => void;
  draftingId?: string | null;
}) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="mb-3 block rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className={`text-sm leading-relaxed ${item.status === "done" ? "text-slate-500 line-through" : "text-white"}`}>
          {item.text}
        </p>
        <StatusPill status={item.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {item.owner && <span>👤 {item.owner}</span>}
        {item.deadline_raw && <span>🕐 {item.deadline_raw}</span>}
        {meetingTitle && <span>🎙️ {meetingTitle}</span>}
        <TrustScoreBadge score={item.trust_score} />
      </div>
      {item.dependency_hints && item.dependency_hints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.dependency_hints.map((hint, i) => (
            <span key={i} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">🔗 {hint}</span>
          ))}
        </div>
      )}
      {item.supersedes_hint && (
        <div className="mt-2">
          <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-300">↩️ {item.supersedes_hint}</span>
        </div>
      )}
      {onDraftFollowup && (item.status === "at_risk" || item.status === "blocked") && (
        <button
          onClick={(e) => { e.preventDefault(); onDraftFollowup(item.id); }}
          disabled={draftingId === item.id}
          className="mt-3 rounded-lg bg-amber-900 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-800 disabled:opacity-50"
        >
          {draftingId === item.id ? "Drafting…" : "✉️ Draft follow-up"}
        </button>
      )}
    </Link>
  );
}
