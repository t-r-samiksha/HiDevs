"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Item, ItemStatus } from "../types";
import DraggableItemCard from "./DraggableItemCard";

/** A droppable kanban column for one status. */
export default function KanbanColumn({
  status,
  label,
  items,
}: {
  status: ItemStatus;
  label: string;
  items: Item[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-72 shrink-0 flex-col md:w-auto md:min-w-0 md:flex-1">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-slate-300">{label}</h3>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 rounded-xl border p-2 transition-colors ${
          isOver ? "border-blue-500 bg-blue-950/30" : "border-slate-800 bg-slate-900/50"
        }`}
      >
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-slate-600">Drop items here</p>
        ) : (
          items.map((item) => <DraggableItemCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
