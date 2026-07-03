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

const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#14b8a6",
  at_risk: "#d97706",
  blocked: "#dc2626",
  done: "#16a34a",
};

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
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-400">Items created (last 7 days)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={days} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
            <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-400">Status breakdown</h3>
        {statusData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-600">No items yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {statusData.map((d) => (
                  <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
