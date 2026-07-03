"use client";

import ReporteeRow, { type TeamRow } from "./ReporteeRow";

/** Team status table: one expandable row per member. */
export default function TeamStatusTable({ rows }: { rows: TeamRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3 text-left font-medium">Team member</th>
            <th className="px-3 py-3 text-left font-medium">Role</th>
            <th className="px-3 py-3 text-center font-medium">Open</th>
            <th className="px-3 py-3 text-center font-medium">At risk</th>
            <th className="px-3 py-3 text-center font-medium">Blocked</th>
            <th className="px-3 py-3 text-center font-medium">Done</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ReporteeRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
