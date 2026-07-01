"use client";

import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Item } from "../components/types";
import KanbanBoard from "../components/items/KanbanBoard";

export default function ItemsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setItems([]);
      return;
    }
    setError(null);
    setItems(data ?? []);
  }

  useEffect(() => {
    // Initial data fetch on mount is a legitimate effect use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Items</h1>
        <p className="mt-1 text-sm text-slate-400">
          Drag cards between columns to update their status. Click a card to open it.
        </p>
      </div>

      {/* Loading skeleton */}
      {items === null && !error && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-24 animate-pulse rounded bg-slate-800" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-900" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-900" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950 p-6 text-center">
          <p className="text-sm text-red-300">Failed to load items: {error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-lg bg-red-800 px-4 py-1.5 text-sm text-red-100 hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {items && items.length === 0 && !error && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
          <ListTodo className="mx-auto mb-3 text-slate-600" size={40} />
          <p className="font-medium text-slate-300">No items yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Upload a transcript to extract decisions and action items.
          </p>
          <a
            href="/upload"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Upload transcript
          </a>
        </div>
      )}

      {/* Board */}
      {items && items.length > 0 && <KanbanBoard initialItems={items} />}
    </div>
  );
}
