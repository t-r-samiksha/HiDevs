"use client";

/** Slim bar above the Jitsi embed: title, recording light, end button. */
export default function RoomControls({
  title,
  recording,
  onEnd,
}: {
  title: string;
  recording: boolean;
  onEnd: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="font-medium text-white">{title}</h1>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`h-2.5 w-2.5 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-slate-600"}`} />
          {recording ? "Recording" : "Not recording"}
        </span>
      </div>
      <button
        onClick={onEnd}
        className="rounded-lg bg-red-950 px-4 py-1.5 text-sm font-medium text-red-300 hover:bg-red-900"
      >
        End & exit
      </button>
    </div>
  );
}
