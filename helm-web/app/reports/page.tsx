"use client";

import { useEffect, useState } from "react";
import { FileBarChart } from "lucide-react";
import WeeklyReportCard, { type WeeklyReport } from "../components/reports/WeeklyReportCard";

// Single hardcoded project until the pipeline supports real multi-project selection.
const PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

// Fallback shown only if the real API genuinely errors (not the normal path anymore).
const MOCK_REPORTS: WeeklyReport[] = [
  {
    id: "r1",
    week_start: new Date(Date.now() - 7 * 864e5).toISOString(),
    week_end: new Date().toISOString(),
    meetings_count: 3,
    tasks_completed: 8,
    tasks_pending: 5,
    major_decisions: ["Switch primary datastore to PostgreSQL", "Freeze scope for the demo build"],
    meeting_roi_scores: [
      { title: "Kickoff", itemCount: 6 },
      { title: "Standup", itemCount: 2 },
      { title: "Demo prep", itemCount: 0 },
    ],
    signals: ["2 action items have slipped their deadline twice — consider reassigning."],
  },
  {
    id: "r2",
    week_start: new Date(Date.now() - 14 * 864e5).toISOString(),
    week_end: new Date(Date.now() - 7 * 864e5).toISOString(),
    meetings_count: 2,
    tasks_completed: 5,
    tasks_pending: 3,
    major_decisions: ["Adopt Enkrypt for trust scoring"],
    meeting_roi_scores: [
      { title: "Planning", itemCount: 4 },
      { title: "Sync", itemCount: 1 },
    ],
    signals: [],
  },
];

// Adapts a raw `reports` row (singular, as returned by GET /api/reports/weekly)
// into the shape WeeklyReportCard expects.
function adaptReport(raw: any): WeeklyReport {
  return {
    id: raw.id,
    week_start: raw.week_start,
    week_end: raw.week_end,
    meetings_count: raw.meetings_count ?? 0,
    tasks_completed: raw.tasks_completed ?? 0,
    tasks_pending: raw.tasks_pending ?? 0,
    major_decisions: raw.major_decisions ?? [],
    meeting_roi_scores: (raw.meeting_roi_scores ?? []).map((m: any) => ({
      title: m.title ?? m.meeting_title ?? "Untitled meeting",
      itemCount: m.itemCount ?? m.items_produced ?? 0,
    })),
    signals: raw.signals,
  };
}

export default function ReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/reports/weekly?project_id=${PROJECT_ID}`);
      if (!res.ok) throw new Error("not ready");
      const data = await res.json();
      // The API returns the single most-recent report ({report: {...} | null}),
      // not a full history array — normalize into the array shape this page renders.
      const raw = data.reports ?? (data.report ? [data.report] : []);
      setReports(raw.map(adaptReport));
      setUsingMock(false);
    } catch {
      setReports(MOCK_REPORTS);
      setUsingMock(true);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/weekly/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: PROJECT_ID }),
      });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => ({}));
        alert("Report generation failed: " + (data.error || "unknown error"));
      }
    } catch (err) {
      console.error("Report generation failed:", err);
      alert("Report generation failed — see console for details.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Weekly reports</h1>
          <p className="mt-1 text-sm text-slate-400">
            Per-week summary of meetings, tasks, decisions, and ROI.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate report"}
        </button>
      </div>

      {usingMock && (
        <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/60 px-3 py-2 text-xs text-amber-300">
          Showing sample data — couldn&apos;t reach the reports API. Retry or generate a fresh report.
        </div>
      )}

      {reports === null && <div className="h-64 animate-pulse rounded-2xl bg-slate-900" />}

      {reports && reports.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <FileBarChart className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">No reports yet</p>
          <p className="mt-1 text-sm text-slate-500">Generate your first weekly report.</p>
        </div>
      )}

      {reports && reports.length > 0 && (
        <div className="space-y-4">
          {reports.map((r) => (
            <WeeklyReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
