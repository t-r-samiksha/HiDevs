"use client";

import { useEffect, useState } from "react";
import { FileBarChart } from "lucide-react";
import WeeklyReportCard, { type WeeklyReport } from "../components/reports/WeeklyReportCard";
import { PROJECT_ID } from "../lib/project";

// Map a raw `reports` row to the card's shape.
function mapReport(r: {
  id: string;
  week_start: string;
  week_end: string;
  meetings_count?: number;
  tasks_completed?: number;
  tasks_pending?: number;
  major_decisions?: unknown[];
  meeting_roi_scores?: { meeting_title?: string; title?: string; items_produced?: number; itemCount?: number }[];
}): WeeklyReport {
  return {
    id: r.id,
    week_start: r.week_start,
    week_end: r.week_end,
    meetings_count: r.meetings_count ?? 0,
    tasks_completed: r.tasks_completed ?? 0,
    tasks_pending: r.tasks_pending ?? 0,
    major_decisions: (r.major_decisions ?? []).map((d) =>
      typeof d === "string" ? d : ((d as { text?: string })?.text ?? String(d))
    ),
    meeting_roi_scores: (r.meeting_roi_scores ?? []).map((m) => ({
      title: m.meeting_title ?? m.title ?? "Meeting",
      itemCount: m.items_produced ?? m.itemCount ?? 0,
    })),
  };
}

export default function ReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/reports/weekly?project_id=${PROJECT_ID}`);
      const data = await res.json();
      setReports(data.report ? [mapReport(data.report)] : []);
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
        const d = await res.json().catch(() => ({}));
        alert("Report generation failed: " + (d.error || res.statusText));
      }
    } catch (e) {
      alert("Report generation failed: " + (e instanceof Error ? e.message : "unknown"));
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
