"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { KANBAN_COLUMNS, type Item, type ItemStatus } from "../types";
import KanbanColumn from "./KanbanColumn";
import TrustScoreBadge from "../TrustScoreBadge";

/**
 * Kanban board over the `items` table. Dragging a card to another column
 * writes the new status back to Supabase (optimistic, with rollback on error).
 */
export default function KanbanBoard({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 6px activation distance so clicks (open detail) aren't swallowed by drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const newStatus = e.over?.id as ItemStatus | undefined;
    if (!newStatus) return;

    const current = items.find((i) => i.id === id);
    if (!current || current.status === newStatus) return;

    const prevStatus = current.status;
    // Optimistic update.
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));

    const { error: updateErr } = await supabase
      .from("items")
      .update({ status: newStatus })
      .eq("id", id);

    if (updateErr) {
      // Roll back.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: prevStatus } : i)));
      setError(`Could not move item: ${updateErr.message}`);
      setTimeout(() => setError(null), 4000);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-5 md:overflow-visible">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              items={items.filter((i) => i.status === col.status)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="w-64 rotate-2 rounded-lg border border-blue-500 bg-slate-800 p-3 shadow-xl">
              <p className="mb-2 line-clamp-3 text-sm text-slate-100">{activeItem.text}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {activeItem.owner && <span>👤 {activeItem.owner}</span>}
                <TrustScoreBadge score={activeItem.trust_score} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
