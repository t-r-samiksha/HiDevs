"use client";

import { useState } from "react";

/** Sends a sample item to a connected integration via the test endpoint. */
export default function TestPushButton({ integrationId, toolName }: { integrationId: string; toolName: string }) {
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/${integrationId}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      alert(res.ok ? `Test push to ${toolName}: ${data.message ?? "sent"}` : `Test failed: ${data.error ?? res.statusText}`);
    } catch (e) {
      alert(`Test failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={test}
      disabled={busy}
      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
    >
      {busy ? "Testing…" : "Test"}
    </button>
  );
}
