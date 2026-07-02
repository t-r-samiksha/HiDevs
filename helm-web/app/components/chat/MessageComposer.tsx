"use client";

import { useState } from "react";
import { Send } from "lucide-react";

/** Text input + send button. */
export default function MessageComposer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-800 p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message…"
        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="rounded-xl bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-40"
        aria-label="Send"
      >
        <Send size={18} />
      </button>
    </form>
  );
}
