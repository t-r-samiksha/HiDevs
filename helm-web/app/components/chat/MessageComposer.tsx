"use client";

import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";

/** Text input + send button. `onSend` may be async; the button shows a spinner. */
export default function MessageComposer({
  onSend,
  onTyping,
}: {
  onSend: (text: string) => void | Promise<void>;
  onTyping?: (typing: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
    onTyping?.(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping?.(false), 2000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTyping?.(false);
    setText("");
    setSending(true);
    try {
      await onSend(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-800 p-3">
      <input
        value={text}
        onChange={handleChange}
        placeholder="Message…"
        className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-[var(--accent)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        className="rounded-lg bg-blue-600 p-2.5 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
        aria-label="Send"
      >
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
      </button>
    </form>
  );
}
