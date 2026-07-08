"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ThresholdControl from "../../components/settings/ThresholdControl";
import PromptEditor from "../../components/settings/PromptEditor";
import LearningDashboard from "../../components/settings/LearningDashboard";
import type { AuditEntry } from "../../components/settings/AuditLogTable";

type ApiChange = {
  id: string;
  entity: string;
  old_value: unknown;
  new_value: unknown;
  driving_signal: string | null;
  triggered_by: string | null;
  created_at: string;
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function summarize(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type AgentPrompt = {
  agentId: string;
  name: string;
  prompt: string;
  default_prompt: string;
  is_overridden: boolean;
};

export default function IntelligencePage() {
  const [atRiskDays, setAtRiskDays] = useState(3);
  const [silenceDays, setSilenceDays] = useState(5);
  const [speed, setSpeed] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // Real per-agent prompt registry, persisted via /api/admin/prompts.
  const [agents, setAgents] = useState<AgentPrompt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [promptText, setPromptText] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.agentId === selectedId) ?? null;

  async function loadPrompts() {
    try {
      const res = await fetch("/api/admin/prompts");
      const data = await res.json();
      const list: AgentPrompt[] = data.agents ?? [];
      setAgents(list);
      if (list[0]) {
        setSelectedId((prev) => prev || list[0].agentId);
        setPromptText((prev) => prev || list[0].prompt);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/learning?limit=20");
        const data = await res.json();
        setAudit(
          (data.changes ?? []).map((c: ApiChange) => ({
            id: c.id,
            when: relTime(c.created_at),
            type: c.entity ?? "change",
            change: `${summarize(c.old_value)} → ${summarize(c.new_value)}`,
            why: c.driving_signal ?? c.triggered_by ?? "adaptive update",
          }))
        );
      } catch {
        /* ignore */
      }
    })();
    loadPrompts();
  }, []);

  function selectAgent(id: string) {
    setSelectedId(id);
    setPromptText(agents.find((a) => a.agentId === id)?.prompt ?? "");
    setPromptStatus(null);
  }

  async function savePrompt() {
    if (!selectedId) return;
    setSavingPrompt(true);
    setPromptStatus(null);
    try {
      const res = await fetch(`/api/admin/prompts/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });
      const data = await res.json();
      if (res.ok) {
        setAgents((prev) => prev.map((a) => (a.agentId === selectedId ? { ...a, prompt: promptText, is_overridden: true } : a)));
        setPromptStatus("Saved");
      } else {
        setPromptStatus(data.error || "Save failed");
      }
    } catch {
      setPromptStatus("Save failed");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function restorePrompt() {
    if (!selectedId) return;
    setSavingPrompt(true);
    setPromptStatus(null);
    try {
      const res = await fetch(`/api/admin/prompts/${selectedId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const def = data.prompt ?? selectedAgent?.default_prompt ?? "";
        setPromptText(def);
        setAgents((prev) => prev.map((a) => (a.agentId === selectedId ? { ...a, prompt: def, is_overridden: false } : a)));
        setPromptStatus("Restored default");
      } else {
        setPromptStatus(data.error || "Restore failed");
      }
    } catch {
      setPromptStatus("Restore failed");
    } finally {
      setSavingPrompt(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Settings
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-white">Intelligence</h1>
      <p className="mb-6 text-sm text-slate-400">
        Tune the adaptive risk thresholds and edit agent prompts.
      </p>

      {/* Thresholds */}
      <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Thresholds</h2>
        <ThresholdControl label="At-risk window (days before deadline)" value={atRiskDays} min={1} max={14} onChange={setAtRiskDays} />
        <ThresholdControl label="Silence window (days without activity)" value={silenceDays} min={1} max={21} onChange={setSilenceDays} />
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-400">Adaptation speed</p>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            {(["conservative", "balanced", "aggressive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                  speed === s ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Prompt editor — real, persisted per-agent overrides */}
      <PromptEditor
        agents={agents.map((a) => ({ agentId: a.agentId, name: a.name }))}
        selectedId={selectedId}
        onSelect={selectAgent}
        value={promptText}
        onChange={setPromptText}
        onSave={savePrompt}
        onRestore={restorePrompt}
        saving={savingPrompt}
        isOverridden={!!selectedAgent?.is_overridden}
        status={promptStatus}
      />

      {/* Audit log */}
      <LearningDashboard entries={audit} />
    </div>
  );
}
