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
    status: string;
  } | null;
};

export default function FollowupsPage() {
  useManagerGuard();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchEscalations() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("escalation_logs")
        .select("*, items(text, owner, deadline_raw, status)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
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

  async function handleResolve(escalationId: string, action: "approve" | "reject") {
    setActionLoading(escalationId);
    await fetch("/api/followup/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalation_id: escalationId, action }),
    });
    await fetchEscalations();
    setActionLoading(null);
  }

  const pending = escalations.filter((e) => e.status === "pending");
  const resolved = escalations.filter((e) => e.status !== "pending");

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Approval queue</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Follow-up messages drafted by the AI, waiting for your approval before sending.
        </p>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-red-500 text-sm">{loadError}</p>
            <button
              onClick={fetchEscalations}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : escalations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 dark:text-gray-600 mb-2">No follow-ups yet.</p>
            <p className="text-sm text-gray-400 dark:text-gray-600">
              Use the &quot;Draft follow-up&quot; button on at-risk items in the dashboard to generate one.
            </p>
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  ⏳ Pending approval ({pending.length})
                </h3>
                {pending.map((esc) => (
                  <div
                    key={esc.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4"
                  >
                    {/* Item context */}
                    <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Tier {esc.tier} nudge</span>
                      <span>·</span>
                      <span>👤 {esc.items?.owner || "Unknown"}</span>
                      <span>·</span>
                      <span className={esc.policy_passed
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                      }>
                        🛡️ Policy: {esc.policy_passed ? "passed" : "flagged"}
                      </span>
                    </div>

                    {/* Task */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Re: &quot;{esc.items?.text || "Unknown item"}&quot;
                    </p>

                    {/* Draft */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 border-l-2 border-blue-400">
                      <p className="text-sm text-gray-800 dark:text-gray-200 italic leading-relaxed">
                        &quot;{esc.drafted_text}&quot;
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleResolve(esc.id, "approve")}
                        disabled={actionLoading === esc.id}
                        className="px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm font-medium hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 transition-colors"
                      >
                        ✓ Approve &amp; send
                      </button>
                      <button
                        onClick={() => handleResolve(esc.id, "reject")}
                        disabled={actionLoading === esc.id}
                        className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50 transition-colors"
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resolved */}
            {resolved.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  History ({resolved.length})
                </h3>
                {resolved.map((esc) => (
                  <div
                    key={esc.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-3 opacity-60"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        To: {esc.items?.owner || "Unknown"} — &quot;{esc.items?.text?.slice(0, 50)}...&quot;
                      </p>
                      <span
                        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                          esc.status === "approved"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        }`}
                      >
                        {esc.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 italic">&quot;{esc.drafted_text.slice(0, 80)}...&quot;</p>
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
