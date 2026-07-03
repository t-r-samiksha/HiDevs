"use client";

import { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";

/**
 * "Today's Briefing" digest with a voice button that reads the summary aloud
 * via the Web Speech API (free, no key). Falls back gracefully if the browser
 * has no speech synthesis.
 */
export default function BriefingDigest({ summary }: { summary: string }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Stop any speech on unmount.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  function toggle() {
    if (!supported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(summary);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Today&apos;s briefing</h2>
        {supported && (
          <button
            onClick={toggle}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
              speaking ? "bg-red-950 text-red-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            aria-label={speaking ? "Stop briefing" : "Play briefing"}
          >
            {speaking ? <Square size={13} /> : <Volume2 size={13} />}
            {speaking ? "Stop" : "Listen"}
          </button>
        )}
      </div>
      <p className="text-sm leading-relaxed text-slate-200">{summary}</p>
    </div>
  );
}
