"use client";

import { useEffect, useRef } from "react";
import type { Message } from "./types";

/** Scrollable message list, newest at the bottom. */
export default function MessageThread({
  messages,
  currentUserId,
}: {
  messages: Message[];
  currentUserId: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        No messages yet — say hello 👋
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((m, i) => {
        const mine = m.sender_id === currentUserId;
        // Consecutive messages from the same sender are grouped: only the
        // first in a run gets the name and the extra top spacing.
        const isNewGroup = i === 0 || messages[i - 1].sender_id !== m.sender_id;
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} ${isNewGroup ? "mt-4" : "mt-1"}`}>
            <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"}`}>
              {!mine && isNewGroup && <p className="mb-0.5 px-1 text-xs text-slate-500">{m.sender_name}</p>}
              <div
                className={`rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-100"
                }`}
              >
                {m.text}
              </div>
              <p className={`mt-0.5 px-1 text-[10px] text-slate-600 ${mine ? "text-right" : ""}`}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
