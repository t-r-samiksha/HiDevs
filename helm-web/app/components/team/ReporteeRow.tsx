"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Item } from "../types";
import StatusPill from "../StatusPill";

export type TeamRow = {
  id: string;
  name: string;
  role: string;
  counts: { open: number; in_progress: number; at_risk: number; blocked: number; done: number };
  items: Item[];
};

const roleBadge: Record<string, string> = {
  vp: "bg-purple-900 text-purple-200",
  manager: "bg-blue-900 text-blue-200",
  employee: "bg-slate-800 text-slate-300",
};

/** Expandable table row for one team member. */
export default function ReporteeRow({ row }: { row: TeamRow }) {
  const [open, setOpen] = useState(false);
  const total = row.items.length;

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/50"
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {total > 0 ? (
              open ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />
            ) : (
              <span className="w-[15px]" />
            )}
            <span className="font-medium text-slate-100">{row.name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadge[row.role] ?? roleBadge.employee}`}>
            {row.role}
          </span>
        </td>
        <td className="px-3 py-2.5 text-center text-slate-300">{row.counts.open + row.counts.in_progress}</td>
        <td className="px-3 py-2.5 text-center text-amber-400">{row.counts.at_risk}</td>
        <td className="px-3 py-2.5 text-center text-red-400">{row.counts.blocked}</td>
        <td className="px-3 py-2.5 text-center text-green-400">{row.counts.done}</td>
      </tr>
      {open && total > 0 && (
        <tr className="border-t border-slate-800 bg-slate-950/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="space-y-2">
              {row.items.map((it) => (
                <Link
                  key={it.id}
                  href={`/items/${it.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 hover:border-slate-600"
                >
                  <span className="min-w-0 truncate text-sm text-slate-200">{it.text}</span>
                  <StatusPill status={it.status} />
                </Link>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
