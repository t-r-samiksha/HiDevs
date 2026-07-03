"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Item } from "../types";
import TrustScoreBadge from "../TrustScoreBadge";

/**
 * A single kanban card. Draggable between columns; a plain click (no drag)
 * navigates to the item detail page. We distinguish click vs drag by pointer
 * travel distance so both gestures work on the same element.
 */
export default function DraggableItemCard({ item }: { item: Item }) {
  const router = useRouter();
  const down = useRef<{ x: number; y: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onClick={(e) => {
        // Ignore the click that ends a drag.
        if (down.current) {
          const dx = Math.abs(e.clientX - down.current.x);
          const dy = Math.abs(e.clientY - down.current.y);
          if (dx + dy > 6) return;
        }
        router.push(`/items/${item.id}`);
      }}
      className="cursor-grab touch-none rounded-lg border border-slate-700 bg-slate-800 p-3 text-left shadow-sm transition-colors hover:border-slate-600 active:cursor-grabbing"
    >
      <p
        className={`mb-2 line-clamp-3 text-sm ${
          item.status === "done" ? "text-slate-500 line-through" : "text-slate-100"
        }`}
      >
        {item.text}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {item.owner && <span>👤 {item.owner}</span>}
        {item.deadline_raw && <span>🕐 {item.deadline_raw}</span>}
        <TrustScoreBadge score={item.trust_score} />
      </div>
    </div>
  );
}
