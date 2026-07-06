"use client";

import { useEffect, useState } from "react";
import { FileBarChart } from "lucide-react";
import WeeklyReportCard, { type WeeklyReport } from "../components/reports/WeeklyReportCard";
import { PROJECT_ID } from "../lib/project";


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
    } catch {
      setReports([]);
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
