"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Cpu, Clock, AlertTriangle, ExternalLink } from "lucide-react";

type Trace = {
  id: string;
  timestamp: string;
  model: string;
  prompt_hash: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  status: "success" | "error" | "rate_limited";
  endpoint: string;
};
type Stats = {
  total_calls: number;
  avg_latency_ms: number;
  error_rate: number;
  rate_limit_hits: number;
  models_used: string[];
  total_input_tokens: number;
  total_output_tokens: number;
};
type Health = {
  uptime_seconds: number;
  memory: { rss_mb: number; heap_used_mb: number; heap_total_mb: number };
  node_version: string;
  last_llm_activity: string | null;
};

export default function ObservabilityPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  async function load() {
    try {
      const [t, h] = await Promise.all([
        fetch("/api/observability/traces?limit=50").then((r) => r.json()),
        fetch("/api/observability/health").then((r) => r.json()),
      ]);
      setTraces((t.traces ?? []).slice().reverse());
      setStats(t.stats ?? null);
      setHealth(h ?? null);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const statusColor = (s: string) =>
    s === "success" ? "text-emerald-400" : s === "rate_limited" ? "text-amber-400" : "text-red-400";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-1 flex items-center gap-2">
        <Activity size={20} className="text-blue-400" />
        <h1 className="text-xl font-semibold text-white">Observability</h1>
      </div>
      <p className="mb-6 text-sm text-slate-400">
        Live LLM call tracing, aggregate stats, and system health.{" "}
        <a href="/api/compliance/status" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:underline">
          Compliance report <ExternalLink size={12} />
        </a>
        {" · "}
        <a href="/api/architecture" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:underline">
          Architecture <ExternalLink size={12} />
        </a>
      </p>

      {/* Aggregate stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="LLM calls (last 100)" value={stats?.total_calls ?? 0} icon={<Activity size={15} />} />
        <Stat label="Avg latency" value={`${stats?.avg_latency_ms ?? 0} ms`} icon={<Clock size={15} />} />
        <Stat label="Error rate" value={`${Math.round((stats?.error_rate ?? 0) * 100)}%`} icon={<AlertTriangle size={15} />} />
        <Stat label="Rate-limit hits" value={stats?.rate_limit_hits ?? 0} icon={<AlertTriangle size={15} />} />
        <Stat label="Input tokens" value={stats?.total_input_tokens ?? 0} />
        <Stat label="Output tokens" value={stats?.total_output_tokens ?? 0} />
        <Stat label="Models" value={(stats?.models_used ?? []).join(", ") || "—"} />
        <Stat
          label="Uptime"
          value={health ? `${Math.floor(health.uptime_seconds / 60)}m` : "—"}
          icon={<Cpu size={15} />}
        />
      </div>

      {/* System health */}
      {health && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
          <span className="font-medium text-white">System health:</span>{" "}
          RSS {health.memory.rss_mb} MB · heap {health.memory.heap_used_mb}/{health.memory.heap_total_mb} MB ·
          Node {health.node_version} · last LLM activity {health.last_llm_activity ? new Date(health.last_llm_activity).toLocaleTimeString() : "none yet"}
        </div>
      )}

      {/* Traces table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Tokens (in/out)</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Prompt hash</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  No LLM calls traced yet. Run a search in “Ask” mode to generate traces.
                </td>
              </tr>
            ) : (
              traces.map((t) => (
                <tr key={t.id} className="border-b border-slate-800/60">
                  <td className="px-3 py-2 text-slate-400">{new Date(t.timestamp).toLocaleTimeString()}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{t.endpoint}</td>
                  <td className="px-3 py-2 text-slate-300">{t.model}</td>
                  <td className="px-3 py-2 text-slate-300">{t.latency_ms} ms</td>
                  <td className="px-3 py-2 text-slate-400">{t.input_tokens}/{t.output_tokens}</td>
                  <td className={`px-3 py-2 font-medium ${statusColor(t.status)}`}>{t.status}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{t.prompt_hash}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-600">
        Traces are held in-process (last 1000). Production would export to an OpenTelemetry collector.{" "}
        <Link href="/settings" className="text-blue-400 hover:underline">System settings →</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="truncate text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
