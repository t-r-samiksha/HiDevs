"use client";

import { useManagerGuard } from "../lib/useRole";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewState = "pending_review" | "quarantined";

type Item = {
  id: string;
  type: "decision" | "action_item";
  text: string;
  owner: string | null;
  deadline_raw: string | null;
  status: string;
  trust_score: number;
  review_state: ReviewState;
  source_quote: string | null;
  meeting_id: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const trustColor = (score: number) => {
  if (score >= 0.85) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (score >= 0.6)  return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewPage() {
  useManagerGuard();
  const [items, setItems]       = useState<Item[]>([]);
  const [meetingTitles, setMeetingTitles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── fetch ──
  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [itemsRes, meetingsRes] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .in("review_state", ["pending_review", "quarantined"])
          .order("created_at", { ascending: false }),
        supabase.from("meetings").select("id, title"),
      ]);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      setItems(itemsRes.data ?? []);
      const m = new Map<string, string>();
      (meetingsRes.data ?? []).forEach((r: { id: string; title: string }) =>
        m.set(r.id, r.title)
      );
      setMeetingTitles(m);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load the review queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // ── toast helper ──
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  // ── action handler ──
  async function act(itemId: string, action: "accept" | "edit" | "discard", text?: string) {
    setActioning(itemId);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, action, text }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Action failed", false);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setEditingId(null);
      const labels = { accept: "Accepted", edit: "Saved & accepted", discard: "Discarded" };
      showToast(labels[action], true);
    } finally {
      setActioning(null);
    }
  }

  // ── derived ──
  const quarantined   = items.filter((i) => i.review_state === "quarantined");
  const pendingReview = items.filter((i) => i.review_state === "pending_review");
  const busy = (id: string) => actioning === id;

  // ── loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading review queue…</p>
      </div>
    );
  }

  // ── error ──
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-red-500 text-sm">{loadError}</p>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all ${
            toast.ok
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.ok ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-6 py-6">
        {/* ── Page title ── */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Enkrypt trust review
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Items Enkrypt flagged during extraction. Accept the wording, edit it to
            match the transcript, or discard if the item was hallucinated.
          </p>
        </div>

        {/* ── Empty state ── */}
        {items.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">🛡️</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">Review queue is empty</p>
            <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">
              All extracted items passed Enkrypt&apos;s trust threshold.
            </p>
          </div>
        )}

        {/* ── Quarantined section ── */}
        {quarantined.length > 0 && (
          <section className="mb-8">
            <div className="flex items-start gap-3 mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
              <span className="text-lg shrink-0">🔴</span>
              <div>
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">
                  Quarantined — {quarantined.length} item{quarantined.length !== 1 ? "s" : ""}
                </h3>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  Enkrypt&apos;s adherence check found the item text is NOT supported by the source
                  quote. Likely hallucinated or severely paraphrased. Discard unless you can
                  correct the wording.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {quarantined.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  meetingTitle={meetingTitles.get(item.meeting_id)}
                  editingId={editingId}
                  editText={editText}
                  busy={busy(item.id)}
                  onEdit={() => { setEditingId(item.id); setEditText(item.text); }}
                  onEditChange={setEditText}
                  onEditCancel={() => setEditingId(null)}
                  onAccept={() => act(item.id, "accept")}
                  onSaveEdit={() => act(item.id, "edit", editText)}
                  onDiscard={() => act(item.id, "discard")}
                  borderClass="border-red-200 dark:border-red-800"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Pending review section ── */}
        {pendingReview.length > 0 && (
          <section>
            <div className="flex items-start gap-3 mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <span className="text-lg shrink-0">🟡</span>
              <div>
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Pending review — {pendingReview.length} item{pendingReview.length !== 1 ? "s" : ""}
                </h3>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Adherence passed (item is grounded in the transcript) but relevancy scored
                  lower — the extraction may be off-topic or oddly worded. Accept, refine, or
                  discard.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {pendingReview.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  meetingTitle={meetingTitles.get(item.meeting_id)}
                  editingId={editingId}
                  editText={editText}
                  busy={busy(item.id)}
                  onEdit={() => { setEditingId(item.id); setEditText(item.text); }}
                  onEditChange={setEditText}
                  onEditCancel={() => setEditingId(null)}
                  onAccept={() => act(item.id, "accept")}
                  onSaveEdit={() => act(item.id, "edit", editText)}
                  onDiscard={() => act(item.id, "discard")}
                  borderClass="border-amber-200 dark:border-amber-800"
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

function ReviewCard({
  item,
  meetingTitle,
  editingId,
  editText,
  busy,
  onEdit,
  onEditChange,
  onEditCancel,
  onAccept,
  onSaveEdit,
  onDiscard,
  borderClass,
}: {
  item: Item;
  meetingTitle?: string;
  editingId: string | null;
  editText: string;
  busy: boolean;
  onEdit: () => void;
  onEditChange: (t: string) => void;
  onEditCancel: () => void;
  onAccept: () => void;
  onSaveEdit: () => void;
  onDiscard: () => void;
  borderClass: string;
}) {
  const isEditing = editingId === item.id;

  return (
    <div
      className={`bg-white dark:bg-gray-900 border ${borderClass} rounded-xl p-5 transition-opacity ${
        busy ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* ── Top row: type + trust ── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          {item.type === "decision" ? "📌 decision" : "📋 action item"}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${trustColor(item.trust_score)}`}>
          🛡️ {item.trust_score}
        </span>
        {meetingTitle && (
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            🎙️ {meetingTitle}
          </span>
        )}
      </div>

      {/* ── Item text (or textarea in edit mode) ── */}
      {isEditing ? (
        <textarea
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
          rows={3}
          autoFocus
          className="w-full px-3 py-2 mb-3 rounded-lg border border-blue-400 dark:border-blue-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      ) : (
        <p className="text-sm text-gray-900 dark:text-white leading-relaxed mb-3">{item.text}</p>
      )}

      {/* ── Meta row ── */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
        {item.owner && <span>👤 {item.owner}</span>}
        {item.deadline_raw && <span>🕐 {item.deadline_raw}</span>}
      </div>

      {/* ── Source quote (always visible — this is the evidence) ── */}
      {item.source_quote && (
        <div className="mb-4 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 font-medium">Source quote</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 italic leading-relaxed">
            &quot;{item.source_quote}&quot;
          </p>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {isEditing ? (
          <>
            <button
              onClick={onSaveEdit}
              disabled={!editText.trim()}
              className="px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-40 transition-colors"
            >
              ✓ Save &amp; accept
            </button>
            <button
              onClick={onEditCancel}
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onAccept}
              className="px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
            >
              ✓ Accept
            </button>
            <button
              onClick={onEdit}
              className="px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              ✎ Edit
            </button>
            <button
              onClick={onDiscard}
              className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              ✕ Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
