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
  review_reason?: string | null;
  source_quote: string | null;
  meeting_id: string;
};

type DirUser = { id: string; name: string; email: string | null };

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
  const [usersByName, setUsersByName] = useState<Map<string, DirUser[]>>(new Map());
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
      const [itemsRes, meetingsRes, usersRes] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .in("review_state", ["pending_review", "quarantined"])
          .order("created_at", { ascending: false }),
        supabase.from("meetings").select("id, title"),
        supabase.from("users").select("id, name, email"),
      ]);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      setItems(itemsRes.data ?? []);
      const m = new Map<string, string>();
      (meetingsRes.data ?? []).forEach((r: { id: string; title: string }) =>
        m.set(r.id, r.title)
      );
      setMeetingTitles(m);
      // Directory keyed by lowercased name — powers owner-conflict detection
      // and the assignment dropdown.
      const u = new Map<string, DirUser[]>();
      (usersRes.data ?? []).forEach((r: DirUser) => {
        const k = String(r.name || "").trim().toLowerCase();
        if (!k) return;
        if (!u.has(k)) u.set(k, []);
        u.get(k)!.push(r);
      });
      setUsersByName(u);
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

  // ── owner-conflict helpers ──
  // An item is an owner conflict when its owner name maps to more than one user
  // in the directory (or the pipeline flagged it via review_reason). Works even
  // if the review_reason column hasn't been added yet.
  function conflictUsers(item: Item): DirUser[] {
    if (!item.owner) return [];
    const matches = usersByName.get(item.owner.trim().toLowerCase()) ?? [];
    const flagged = item.review_reason?.includes("Multiple users") ?? false;
    return matches.length > 1 || (flagged && matches.length > 0) ? matches : [];
  }

  async function assignOwner(item: Item, user: DirUser) {
    setActioning(item.id);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: user.name,
          owner_email: user.email,
          owner_id: user.id,
          review_state: "auto",
          review_reason: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Assignment failed", false);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast(`Assigned to ${user.name}`, true);
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
              {pendingReview.map((item) => {
                const conflicts = conflictUsers(item);
                if (conflicts.length > 0) {
                  return (
                    <OwnerConflictCard
                      key={item.id}
                      item={item}
                      candidates={conflicts}
                      meetingTitle={meetingTitles.get(item.meeting_id)}
                      busy={busy(item.id)}
                      onAssign={(user) => assignOwner(item, user)}
                      onDiscard={() => act(item.id, "discard")}
                    />
                  );
                }
                return (
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
                );
              })}
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

// ---------------------------------------------------------------------------
// OwnerConflictCard — ambiguous owner name, manager picks the right person
// ---------------------------------------------------------------------------

function OwnerConflictCard({
  item,
  candidates,
  meetingTitle,
  busy,
  onAssign,
  onDiscard,
}: {
  item: Item;
  candidates: DirUser[];
  meetingTitle?: string;
  busy: boolean;
  onAssign: (user: DirUser) => void;
  onDiscard: () => void;
}) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const selected = candidates.find((u) => u.id === selectedId);

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-xl p-5 transition-opacity ${
        busy ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
          👥 owner conflict
        </span>
        {meetingTitle && (
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">🎙️ {meetingTitle}</span>
        )}
      </div>

      {/* ── Title ── */}
      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-relaxed mb-1">
        Owner conflict: {item.text}
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">
        Multiple users found for &quot;{item.owner}&quot; — pick who this belongs to.
      </p>

      {/* ── Picker ── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}{u.email ? ` — ${u.email}` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => selected && onAssign(selected)}
          disabled={!selected}
          className="px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-40 transition-colors"
        >
          ✓ Assign
        </button>
        <button
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
        >
          ✕ Discard
        </button>
      </div>
    </div>
  );
}
