"use client";

import { useEffect, useState } from "react";
import { FileBarChart } from "lucide-react";
import WeeklyReportCard, { type WeeklyReport } from "../components/reports/WeeklyReportCard";

// Mock reports until Member 1 ships GET /api/reports/weekly.
// TODO: Replace MOCK_REPORTS with the real fetch below.
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

export default function ReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/reports/weekly");
      if (!res.ok) throw new Error("not ready");
      const data = await res.json();
      setReports(data.reports ?? []);
      setUsingMock(false);
    } catch {
      setReports(MOCK_REPORTS);
      setUsingMock(true);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/weekly/generate", { method: "POST" });
      if (res.ok) await load();
      else alert("Report generation isn't available yet (pending Member 1's reports API).");
    } catch {
      alert("Report generation isn't available yet (pending Member 1's reports API).");
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
          Showing sample data — live reports arrive with Member 1&apos;s reports API.
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
