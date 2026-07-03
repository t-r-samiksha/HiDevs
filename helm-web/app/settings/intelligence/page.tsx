"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ThresholdControl from "../../components/settings/ThresholdControl";
import PromptEditor from "../../components/settings/PromptEditor";
import LearningDashboard from "../../components/settings/LearningDashboard";

// Mock adaptive-intelligence UI. TODO: wire to Member 1's adaptive learning
// APIs (audit_logs, adaptive_thresholds, versioned prompts).

const MOCK_AUDIT = [
  { id: "a1", when: "2h ago", type: "threshold", change: "at_risk_days 3 → 2 for Rahul", why: "closed 4 tasks early" },
  { id: "a2", when: "1d ago", type: "prompt", change: "extraction prompt v3 → v4", why: "improved owner accuracy" },
  { id: "a3", when: "3d ago", type: "threshold", change: "silence_days 5 → 7 (team-wide)", why: "reduced false at-risk flags" },
];

const DEFAULT_PROMPT = "You read a meeting transcript and extract every DECISION and ACTION ITEM…";

export default function IntelligencePage() {
  const [atRiskDays, setAtRiskDays] = useState(3);
  const [silenceDays, setSilenceDays] = useState(5);
  const [speed, setSpeed] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Settings
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-white">Intelligence</h1>
      <p className="mb-6 text-sm text-slate-400">
        Tune the adaptive risk thresholds and extraction prompts.
      </p>
      <div className="mb-6 rounded-lg border border-amber-800 bg-amber-950/60 px-3 py-2 text-xs text-amber-300">
        Sample UI — controls persist once Member 1&apos;s adaptive learning APIs are live.
      </div>

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

      {/* Prompt editor */}
      <PromptEditor value={prompt} onChange={setPrompt} onRestore={() => setPrompt(DEFAULT_PROMPT)} />

      {/* Audit log */}
      <LearningDashboard entries={MOCK_AUDIT} />
    </div>
  );
}
