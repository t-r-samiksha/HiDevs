"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Item, ItemStatus } from "../../components/types";
import { KANBAN_COLUMNS } from "../../components/types";
import StatusPill from "../../components/StatusPill";
import TrustScoreBadge from "../../components/TrustScoreBadge";
import DependencyChips from "../../components/items/DependencyChips";

type LinkedItem = { id: string; text: string; status: string };

export default function ItemDetailPage() {
  const params = useParams();
  const itemId = params.id as string;

  const [item, setItem] = useState<Item | null>(null);
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedItem[]>([]);
  const [supersedes, setSupersedes] = useState<LinkedItem | null>(null);
  const [contradiction, setContradiction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Inline edit form state.
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ text: "", owner: "", deadline_raw: "", status: "open" as ItemStatus });
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftResult, setDraftResult] = useState<
    { kind: "success"; owner: string; draft: string } | { kind: "error"; message: string } | null
  >(null);

  async function load() {
    const { data, error } = await supabase.from("items").select("*").eq("id", itemId).single();
    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const it = data as Item;
    setItem(it);
    setForm({
      text: it.text,
      owner: it.owner ?? "",
      deadline_raw: it.deadline_raw ?? "",
      status: it.status,
    });

    // Fetch related data in parallel.
    const [meetingRes, depsRes, supRes, contraRes] = await Promise.all([
      supabase.from("meetings").select("title").eq("id", it.meeting_id).single(),
      it.depends_on && it.depends_on.length > 0
        ? supabase.from("items").select("id, text, status").in("id", it.depends_on)
        : Promise.resolve({ data: [] as LinkedItem[] }),
      it.supersedes_id
        ? supabase.from("items").select("id, text, status").eq("id", it.supersedes_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("contradictions")
        .select("*")
        .or(`item_a_id.eq.${it.id},item_b_id.eq.${it.id}`)
        .limit(1),
    ]);

    setMeetingTitle((meetingRes.data as { title: string } | null)?.title ?? null);
    setLinked((depsRes.data as LinkedItem[]) ?? []);
    setSupersedes((supRes.data as LinkedItem | null) ?? null);
    const c = (contraRes.data as { description?: string; explanation?: string }[] | null)?.[0];
    setContradiction(c ? c.description ?? c.explanation ?? "Contradiction detected" : null);
    setLoading(false);
  }

  useEffect(() => {
    // Initial data fetch on mount is a legitimate effect use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function save() {
    if (!item) return;
    setSaving(true);
    const patch = {
      text: form.text.trim(),
      owner: form.owner.trim() || null,
      deadline_raw: form.deadline_raw.trim() || null,
      status: form.status,
    };
    const { error } = await supabase.from("items").update(patch).eq("id", item.id);
    setSaving(false);
    if (!error) {
      setItem({ ...item, ...patch });
      setEditing(false);
    }
  }

  async function markDone() {
    if (!item) return;
    await supabase.from("items").update({ status: "done" }).eq("id", item.id);
    setItem({ ...item, status: "done" });
    setForm((f) => ({ ...f, status: "done" }));
  }

  async function draftFollowup() {
    if (!item) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/followup/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const data = await res.json();
      if (data.escalation_id) {
        setDraftResult({ kind: "success", owner: data.owner, draft: data.draft });
      } else {
        setDraftResult({ kind: "error", message: data.error || "unknown error" });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDrafting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <div className="h-6 w-32 animate-pulse rounded bg-slate-800" />
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-900" />
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6">
        <p className="text-slate-300">Item not found.</p>
        <Link href="/items" className="mt-3 inline-block text-sm text-blue-400 hover:underline">
          ← Back to items
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      {draftResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDraftResult(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {draftResult.kind === "success" ? (
              <>
                <p className="mb-3 text-sm font-semibold text-white">
                  ✉️ Follow-up drafted for {draftResult.owner}
                </p>
                <blockquote className="mb-4 rounded-lg border-l-2 border-indigo-400 bg-slate-950/60 p-4 text-sm italic leading-relaxed text-slate-200">
                  {draftResult.draft}
                </blockquote>
                <div className="flex items-center gap-3">
                  <Link
                    href="/followups"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    Go to Approval Queue
                  </Link>
                  <button
                    onClick={() => setDraftResult(null)}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm font-semibold text-red-300">Failed to draft follow-up</p>
                <p className="mb-4 text-sm text-slate-300">{draftResult.message}</p>
                <button
                  onClick={() => setDraftResult(null)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <Link
        href="/items"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={16} /> Back to items
      </Link>

      {contradiction && (
        <div className="mb-4 rounded-xl border border-amber-800 bg-amber-950 px-4 py-3">
          <p className="text-sm font-medium text-amber-200">⚠️ Contradiction</p>
          <p className="mt-1 text-sm text-amber-300">{contradiction}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        {/* Header row */}
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
            {item.type === "decision" ? "📌 decision" : "📋 action item"}
          </span>
          <StatusPill status={item.status} />
        </div>

        {/* Text */}
        {editing ? (
          <textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            rows={3}
            className="mb-4 w-full rounded-lg border border-blue-600 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <p className="mb-4 text-lg leading-relaxed text-white">{item.text}</p>
        )}

        {/* Trust bar */}
        <TrustScoreBadge score={item.trust_score} showBar className="mb-5" />

        {/* Owner / deadline / status (editable) */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Owner">
            {editing ? (
              <input
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="unassigned"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <span className="text-sm text-slate-200">{item.owner || "unassigned"}</span>
            )}
          </Field>
          <Field label="Deadline">
            {editing ? (
              <input
                value={form.deadline_raw}
                onChange={(e) => setForm({ ...form, deadline_raw: e.target.value })}
                placeholder="none"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <span className="text-sm text-slate-200">{item.deadline_raw || "none"}</span>
            )}
          </Field>
          <Field label="Status">
            {editing ? (
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ItemStatus })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <StatusPill status={item.status} />
            )}
          </Field>
        </div>

        {/* Dependencies */}
        <div className="mb-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Dependencies</p>
          <DependencyChips linked={linked} hints={item.dependency_hints ?? []} />
        </div>

        {/* Supersedes link */}
        {supersedes && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Supersedes</p>
            <Link
              href={`/items/${supersedes.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:border-blue-500 hover:text-blue-300"
            >
              ↩️ {supersedes.text}
            </Link>
          </div>
        )}
        {item.supersedes_hint && !supersedes && (
          <div className="mb-5">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-900 px-2.5 py-1 text-xs text-amber-300">
              ↩️ {item.supersedes_hint}
            </span>
          </div>
        )}

        {/* Source quote */}
        {item.source_quote && (
          <details className="mb-5" open>
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">
              Source quote
              {meetingTitle && <span className="ml-2 normal-case text-slate-400">🎙️ {meetingTitle}</span>}
              {typeof item.source_timestamp === "number" && (
                <span className="ml-1 normal-case text-slate-500">
                  @ {Math.floor(item.source_timestamp / 60)}:
                  {String(item.source_timestamp % 60).padStart(2, "0")}
                </span>
              )}
            </summary>
            <p className="mt-2 border-l-2 border-slate-700 pl-3 text-sm italic text-slate-300">
              &quot;{item.source_quote}&quot;
            </p>
            {meetingTitle && (
              <Link
                href={`/meetings/${item.meeting_id}`}
                className="mt-2 inline-block text-xs text-blue-400 hover:underline"
              >
                View in meeting →
              </Link>
            )}
          </details>
        )}

        {/* State timeline (best-effort — no dedicated history table yet) */}
        {/* TODO: Replace with a real state_history query when Member 1 adds it. */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">History</p>
          <ol className="space-y-1 text-xs text-slate-400">
            <li>• Created {new Date(item.created_at).toLocaleString()}</li>
            <li>• Current status: <span className="text-slate-200">{item.status.replace(/_/g, " ")}</span></li>
          </ol>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={saving || !form.text.trim()}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm({
                    text: item.text,
                    owner: item.owner ?? "",
                    deadline_raw: item.deadline_raw ?? "",
                    status: item.status,
                  });
                }}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                ✎ Edit
              </button>
              {item.status !== "done" && (
                <button
                  onClick={markDone}
                  className="rounded-lg bg-green-900 px-4 py-1.5 text-sm text-green-300 hover:bg-green-800"
                >
                  ✓ Mark done
                </button>
              )}
              {(item.status === "at_risk" || item.status === "blocked") && (
                <button
                  onClick={draftFollowup}
                  disabled={drafting}
                  className="rounded-lg bg-amber-900 px-4 py-1.5 text-sm text-amber-300 hover:bg-amber-800 disabled:opacity-50"
                >
                  {drafting ? "Drafting…" : "✉️ Draft follow-up"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}
