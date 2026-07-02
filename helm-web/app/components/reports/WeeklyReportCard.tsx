import MeetingROIBadge from "./MeetingROIBadge";
import StrategicSignalCard from "./StrategicSignalCard";

export type WeeklyReport = {
  id: string;
  week_start: string;
  week_end: string;
  meetings_count: number;
  tasks_completed: number;
  tasks_pending: number;
  major_decisions: string[];
  meeting_roi_scores: { title: string; itemCount: number }[];
  signals?: string[];
};

export default function WeeklyReportCard({ report }: { report: WeeklyReport }) {
  const range = `${new Date(report.week_start).toLocaleDateString()} – ${new Date(report.week_end).toLocaleDateString()}`;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Week of {range}</h3>
        <span className="text-xs text-slate-500">{report.meetings_count} meetings</span>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Completed" value={report.tasks_completed} color="text-green-400" />
        <Stat label="Pending" value={report.tasks_pending} color="text-amber-400" />
        <Stat label="Meetings" value={report.meetings_count} color="text-slate-200" />
      </div>

      {/* Major decisions */}
      {report.major_decisions.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Major decisions</p>
          <ul className="space-y-1">
            {report.major_decisions.map((d, i) => (
              <li key={i} className="text-sm text-slate-300">📌 {d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Meeting ROI */}
      {report.meeting_roi_scores.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Meeting ROI</p>
          <div className="flex flex-wrap gap-2">
            {report.meeting_roi_scores.map((m, i) => (
              <MeetingROIBadge key={i} title={m.title} itemCount={m.itemCount} />
            ))}
          </div>
        </div>
      )}

      {/* Strategic signals */}
      {report.signals && report.signals.length > 0 && (
        <div className="space-y-2">
          {report.signals.map((s, i) => (
            <StrategicSignalCard key={i} text={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-slate-800/60 px-3 py-2 text-center">
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
