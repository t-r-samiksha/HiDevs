"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Item } from "../components/types";
import TeamStatusTable from "../components/team/TeamStatusTable";
import type { TeamRow } from "../components/team/ReporteeRow";

type User = { id: string; name: string; email: string; role: string; manager_id: string | null };

const EMPTY_COUNTS = { open: 0, in_progress: 0, at_risk: 0, blocked: 0, done: 0 };

/** Collect all users downstream of `rootId` via manager_id (VP view). */
function downstream(rootId: string, users: User[]): User[] {
  const byManager = new Map<string, User[]>();
  for (const u of users) {
    if (!u.manager_id) continue;
    const arr = byManager.get(u.manager_id) ?? [];
    arr.push(u);
    byManager.set(u.manager_id, arr);
  }
  const out: User[] = [];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of byManager.get(id) ?? []) {
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

export default function TeamPage() {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    const email = auth.user?.email ?? null;

    const [usersRes, itemsRes] = await Promise.all([
      supabase.from("users").select("id, name, email, role, manager_id"),
      supabase.from("items").select("*").eq("type", "action_item"),
    ]);

    if (usersRes.error) {
      setError(usersRes.error.message);
      setRows([]);
      return;
    }

    const users = (usersRes.data as User[]) ?? [];
    const items = (itemsRes.data as Item[]) ?? [];
    const me = users.find((u) => u.email === email) ?? null;

    // Decide which members to show based on the viewer's role.
    let visible: User[] = [];
    let label = "";
    if (me?.role === "vp") {
      visible = downstream(me.id, users);
      label = "VP view — your full org, aggregated downstream.";
    } else if (me?.role === "manager") {
      visible = users.filter((u) => u.manager_id === me.id);
      label = "Manager view — your direct reports.";
    }
    // Fallback: no hierarchy configured (common in demo data) → show everyone.
    if (visible.length === 0) {
      visible = users;
      label = me
        ? "No direct reports found — showing all team members."
        : "Showing all team members.";
    }

    // Group items by owner name and build rows.
    const byOwner = new Map<string, Item[]>();
    for (const it of items) {
      if (!it.owner) continue;
      const arr = byOwner.get(it.owner) ?? [];
      arr.push(it);
      byOwner.set(it.owner, arr);
    }

    const built: TeamRow[] = visible.map((u) => {
      const owned = byOwner.get(u.name) ?? [];
      const counts = { ...EMPTY_COUNTS };
      for (const it of owned) {
        if (it.status in counts) counts[it.status as keyof typeof counts]++;
      }
      return { id: u.id, name: u.name, role: u.role, counts, items: owned };
    });

    setError(null);
    setScopeLabel(label);
    setRows(built);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Team status</h1>
        <p className="mt-1 text-sm text-slate-400">
          {scopeLabel || "Action items by team member. Click a row to expand."}
        </p>
      </div>

      {rows === null && !error && <div className="h-48 animate-pulse rounded-2xl bg-slate-900" />}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-300">
          Failed to load team: {error}
          <button onClick={load} className="ml-3 rounded bg-red-800 px-3 py-1 text-red-100 hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <Users className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">No team members yet</p>
          <p className="mt-1 text-sm text-slate-500">Add users (with roles) to populate this view.</p>
        </div>
      )}

      {rows && rows.length > 0 && <TeamStatusTable rows={rows} />}
    </div>
  );
}
