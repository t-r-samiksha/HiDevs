"use client";

import { useManagerGuard } from "../lib/useRole";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Escalation = {
  id: string;
  item_id: string;
  tier: number;
  drafted_text: string;
  status: string;
  policy_passed: boolean;
  created_at: string;
  resolved_at: string | null;
  items: {
    text: string;
    owner: string | null;
    deadline_raw: string | null;
    deadline_iso: string | null;
    status: string;
    meetings: { title: string | null; date: string | null } | null;
  } | null;
};

const TIER_META: Record<number, { label: string; className: string }> = {
  1: { label: "Tier 1 · Friendly nudge", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  2: { label: "Tier 2 · Firm + manager CC", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  3: { label: "Tier 3 · Urgent escalation", className: "bg-red-500/15 text-red-300 border-red-500/30" },
};

function daysOverdue(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

export default function FollowupsPage() {
  useManagerGuard();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [emailByName, setEmailByName] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function showToast(kind: "ok" | "err", text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }

  async function fetchEscalations() {
    setLoading(true);
    setLoadError(null);
    try {
      const [{ data, error }, { data: users }] = await Promise.all([
        supabase
          .from("escalation_logs")
          .select("*, items(text, owner, deadline_raw, deadline_iso, status, meetings(title, date))")
          .order("created_at", { ascending: false }),
        supabase.from("users").select("name, email"),
      ]);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const u of users || []) {
        if (u.name && u.email) map[String(u.name).toLowerCase()] = u.email;
      }
      setEmailByName(map);
      setEscalations(data || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load the approval queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEscalations();
  }, []);

  function ownerEmail(owner: string | null): string | null {
    return owner ? emailByName[owner.toLowerCase()] ?? null : null;
  }

  async function handleResolve(esc: Escalation, action: "approve" | "reject") {
    setActionLoading(esc.id);
    try {
      const res = await fetch("/api/followup/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escalation_id: esc.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");

      if (action === "reject") {
        showToast("ok", "Follow-up rejected — nothing was sent.");
      } else if (data.email_sent) {
        showToast("ok", `Approved & emailed to ${data.sent_to}.`);
      } else if (data.sent_to) {
        showToast("err", `Approved and logged, but the email to ${data.sent_to} failed to send.`);
      } else {
        showToast("ok", "Approved and logged. No email on file, so nothing was sent.");
      }
      await fetchEscalations();
    } catch (err) {
      showToast("err", err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionLoading(null);
    }
  }

  const pending = escalations.filter((e) => e.status === "pending");
  const resolved = escalations.filter((e) => e.status !== "pending");

  return (
    <div className="min-h-full bg-slate-950">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${
            toast.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
              : "border-red-500/40 bg-red-500/15 text-red-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        <h2 className="text-lg font-semibold text-white mb-1">Approval queue</h2>
        <p className="text-sm text-slate-400 mb-6">
          AI-drafted follow-ups waiting for your approval. Approving one emails the assignee directly.
        </p>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-red-400 text-sm">{loadError}</p>
            <button
              onClick={fetchEscalations}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
            >
              Retry
            </button>
          </div>
        ) : escalations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 mb-2">No follow-ups yet.</p>
            <p className="text-sm text-slate-600">
              Run a risk scan or use &quot;Draft follow-up&quot; on an at-risk item to generate one.
            </p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="mb-10">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Pending approval ({pending.length})
                </h3>
                {pending.map((esc) => {
                  const email = ownerEmail(esc.items?.owner ?? null);
                  const overdue = daysOverdue(esc.items?.deadline_iso ?? null);
                  const tier = TIER_META[esc.tier] ?? TIER_META[1];
                  const busy = actionLoading === esc.id;
                  return (
                    <div
                      key={esc.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-4"
                    >
                      {/* Header: tier + policy */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${tier.className}`}>
                          {tier.label}
                        </span>
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                            esc.policy_passed
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : "bg-red-500/15 text-red-300 border-red-500/30"
                          }`}
                        >
                          {esc.policy_passed ? "🛡️ Policy passed" : "🛡️ Policy flagged"}
                        </span>
                        {overdue !== null && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-amber-500/15 text-amber-300 border-amber-500/30">
                            {overdue} day{overdue === 1 ? "" : "s"} overdue
                          </span>
                        )}
                      </div>

                      {/* Task */}
                      <p className="text-[15px] font-semibold text-white leading-snug mb-2">
                        {esc.items?.text || "Unknown item"}
                      </p>

                      {/* Meta: assignee + email + meeting source */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mb-4">
                        <span>
                          👤 {esc.items?.owner || "Unassigned"}
                          {email ? (
                            <span className="text-slate-500"> · {email}</span>
                          ) : (
                            <span className="text-slate-600 italic"> · no email on file</span>
                          )}
                        </span>
                        {esc.items?.meetings?.title && (
                          <span>
                            📋 {esc.items.meetings.title}
                            {esc.items.meetings.date ? ` · ${String(esc.items.meetings.date).split("T")[0]}` : ""}
                          </span>
                        )}
                        {esc.items?.deadline_raw && <span>⏰ due {esc.items.deadline_raw}</span>}
                      </div>

                      {/* Draft */}
                      <blockquote className="bg-slate-950/60 rounded-lg p-4 mb-4 border-l-2 border-indigo-400">
                        <p className="text-sm text-slate-200 italic leading-relaxed">
                          {esc.drafted_text}
                        </p>
                      </blockquote>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleResolve(esc, "approve")}
                          disabled={busy}
                          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                        >
                          {busy ? "Working…" : email ? "✓ Approve & send" : "✓ Approve"}
                        </button>
                        <button
                          onClick={() => handleResolve(esc, "reject")}
                          disabled={busy}
                          className="px-4 py-2 rounded-lg bg-red-600/90 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
                        >
                          ✕ Reject
                        </button>
                        {!email && (
                          <span className="text-xs text-slate-500">
                            No email on file — approval will be logged only.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {resolved.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  History ({resolved.length})
                </h3>
                {resolved.map((esc) => (
                  <div
                    key={esc.id}
                    className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-3"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm text-slate-300 truncate">
                        To {esc.items?.owner || "Unknown"} — {esc.items?.text?.slice(0, 60) || "item"}
                      </p>
                      <span
                        className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                          esc.status === "sent"
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : esc.status === "approved"
                            ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                            : esc.status === "rejected"
                            ? "bg-red-500/15 text-red-300 border-red-500/30"
                            : "bg-slate-700/40 text-slate-300 border-slate-600/40"
                        }`}
                      >
                        {esc.status === "sent" ? "📧 sent" : esc.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 italic">
                      {esc.drafted_text?.slice(0, 90) || "—"}…
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
