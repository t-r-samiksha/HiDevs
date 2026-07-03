"use client";

import { useEffect, useState } from "react";
import { Gavel } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Item } from "../components/types";
import DecisionCard from "../components/decisions/DecisionCard";
import ContradictionAlert from "../components/decisions/ContradictionAlert";

type Contradiction = {
  id: string;
  item_a_id: string;
  item_b_id: string;
  description?: string;
  explanation?: string;
  detected_at?: string;
  created_at?: string;
};

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Item[] | null>(null);
  const [meetings, setMeetings] = useState<Map<string, { title: string; date: string }>>(new Map());
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [decRes, meetRes, contraRes] = await Promise.all([
      supabase.from("items").select("*").eq("type", "decision").order("created_at", { ascending: false }),
      supabase.from("meetings").select("id, title, date"),
      supabase.from("contradictions").select("*"),
    ]);
    if (decRes.error) {
      setError(decRes.error.message);
      setDecisions([]);
      return;
    }
    setError(null);
    setDecisions((decRes.data as Item[]) ?? []);
    const m = new Map<string, { title: string; date: string }>();
    (meetRes.data ?? []).forEach((r: { id: string; title: string; date: string }) =>
      m.set(r.id, { title: r.title, date: r.date })
    );
    setMeetings(m);
    setContradictions((contraRes.data as Contradiction[]) ?? []);
  }

  useEffect(() => {
    // Initial data fetch on mount is a legitimate effect use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const byId = new Map((decisions ?? []).map((d) => [d.id, d]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Decisions</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every decision the team committed to, newest first. Superseding decisions link to the ones they override.
        </p>
      </div>

      {/* Contradiction alerts */}
      {contradictions.length > 0 && (
        <div className="mb-6 space-y-2">
          {contradictions.map((c) => (
            <ContradictionAlert
              key={c.id}
              description={c.description ?? c.explanation ?? "Two decisions conflict."}
              itemAId={c.item_a_id}
              itemBId={c.item_b_id}
            />
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {decisions === null && !error && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
          <p className="text-sm text-red-300">Failed to load decisions: {error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-800 px-4 py-1.5 text-sm text-red-100 hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {decisions && decisions.length === 0 && !error && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <Gavel className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">No decisions yet</p>
          <p className="mt-1 text-sm text-slate-500">Decisions extracted from meetings will appear here.</p>
        </div>
      )}

      {/* Decision cards */}
      {decisions && decisions.length > 0 && (
        <div className="space-y-3">
          {decisions.map((d) => {
            const meeting = meetings.get(d.meeting_id);
            const overrides = d.supersedes_id ? byId.get(d.supersedes_id) : null;
            return (
              <DecisionCard
                key={d.id}
                decision={d}
                meetingTitle={meeting?.title}
                meetingDate={meeting?.date}
                overridesText={overrides ? overrides.text : d.supersedes_hint}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
