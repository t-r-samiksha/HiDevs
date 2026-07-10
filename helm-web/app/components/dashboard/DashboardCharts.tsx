"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type ChartItem = { status: string; created_at: string };

// Match the design tokens (iris accent + brass/emerald/danger gauges).
const STATUS_COLORS: Record<string, string> = {
  open: "#626b7b",
  in_progress: "#7b87f0",
  at_risk: "#e0a43b",
  blocked: "#e0574b",
  done: "#46b98a",
};
const GRID = "#232a36";
const AXIS = "#626b7b";
const TOOLTIP = { background: "#151a23", border: "1px solid #232a36", borderRadius: 8, color: "#e7eaf0" } as const;

/** Line chart (items/day, last 7 days) + pie chart (status breakdown). */
export default function DashboardCharts({ items }: { items: ChartItem[] }) {
  // Items created per day for the last 7 days.
  const days: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const count = items.filter((it) => {
      const c = new Date(it.created_at);
      return c.toDateString() === d.toDateString();
    }).length;
    days.push({ day: label, count });
  }

  // Status breakdown.
  const statusData = Object.keys(STATUS_COLORS)
    .map((s) => ({ name: s.replace("_", " "), key: s, value: items.filter((it) => it.status === s).length }))
    .filter((d) => d.value > 0);

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Items created · last 7 days</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={days} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="day" stroke={AXIS} fontSize={11} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis allowDecimals={false} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: GRID }} />
            <Line type="monotone" dataKey="count" stroke="#7b87f0" strokeWidth={2} dot={{ r: 2, fill: "#7b87f0" }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Status breakdown</h3>
        {statusData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-600">No items yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">
                {statusData.map((d) => (
                  <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
