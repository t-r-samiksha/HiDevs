"use client";

/** Sends a sample item to a connected integration (mock). */
export default function TestPushButton({ toolName }: { toolName: string }) {
  return (
    <button
      onClick={() => alert(`Sent a sample item to ${toolName} (mock).`)}
      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
    >
      Test
    </button>
  );
}
