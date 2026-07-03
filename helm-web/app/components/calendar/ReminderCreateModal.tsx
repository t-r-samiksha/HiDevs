"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Create a manual reminder via POST /api/reminders. A reminder must be linked
 * to an item (the API inner-joins items), so item selection is required.
 */
export default function ReminderCreateModal({
  items = [],
  onClose,
  onCreated,
}: {
  items?: { id: string; text: string }[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [itemId, setItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!message.trim() || !remindAt || !itemId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          remind_at: new Date(remindAt).toISOString(),
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save reminder");
        return;
      }
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save reminder");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">New reminder</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Message</label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Follow up on the DB migration"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Remind at</label>
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Item (required)</label>
            {items.length === 0 ? (
              <p className="text-xs text-slate-500">No items available to attach a reminder to yet.</p>
            ) : (
              <select
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.text.length > 50 ? it.text.slice(0, 50) + "…" : it.text}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !message.trim() || !remindAt || !itemId}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
