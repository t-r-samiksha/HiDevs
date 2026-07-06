"use client";

import { ShieldCheck } from "lucide-react";

/** Slim bar above the Jitsi embed: title, host badge, recording light, exit button. */
export default function RoomControls({
  title,
  recording,
  onEnd,
  isHost = false,
}: {
  title: string;
  recording: boolean;
  onEnd: () => void;
  isHost?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="font-medium text-white">{title}</h1>
        {isHost && (
          <span className="flex items-center gap-1 rounded-full bg-blue-950 px-2 py-0.5 text-xs font-medium text-blue-300">
            <ShieldCheck size={13} /> Host
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-2.5 w-2.5 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-slate-600"}`} />
          {recording ? "Recording" : "Not recording"}
        </span>
      </div>
      <button
        onClick={onEnd}
        className="rounded-lg bg-red-950 px-4 py-1.5 text-sm font-medium text-red-300 hover:bg-red-900"
      >
        {isHost ? "End meeting" : "Leave"}
      </button>
    </div>
  );
}
