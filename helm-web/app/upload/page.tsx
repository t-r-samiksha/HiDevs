"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "text" | "audio";
type TranscribeStep = "idle" | "uploading" | "transcribing" | "done";

const ACCEPTED = ".mp3,.wav,.m4a,.webm";
const MAX_MB = 25;

export default function UploadPage() {
  const router = useRouter();

  // Shared
  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Audio-mode state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribeStep, setTranscribeStep] = useState<TranscribeStep>("idle");
  const [transcribeError, setTranscribeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!processing) { setElapsed(0); return; }
    startTimeRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [processing]);

  // ── Mode switch ──────────────────────────────────────────────────────────
  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setTranscribeError("");
    if (next === "text") {
      setAudioFile(null);
      setTranscribeStep("idle");
    }
  }

  // ── Audio file selection ─────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setTranscribeError("");
    setTranscribeStep("idle");

    if (!f) {
      setAudioFile(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setTranscribeError(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB — Groq's limit is ${MAX_MB} MB.`);
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setAudioFile(f);
  }

  // ── Transcription ────────────────────────────────────────────────────────
  async function handleTranscribe() {
    if (!audioFile) return;
    setTranscribeError("");
    setTranscribeStep("uploading");

    const form = new FormData();
    form.append("file", audioFile);

    try {
      setTranscribeStep("transcribing");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setTranscribeError(data.error || "Transcription failed");
        setTranscribeStep("idle");
        return;
      }

      setTranscript(data.transcript || "");
      setTranscribeStep("done");
      setMode("text"); // show the transcript in the textarea
    } catch (err: any) {
      setTranscribeError(err.message || "Transcription failed");
      setTranscribeStep("idle");
    }
  }

  // ── Pipeline submission ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !transcript.trim()) return;

    setProcessing(true);
    setError("");
    setStatus(["Starting pipeline..."]);

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, transcript }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Pipeline failed");
        setProcessing(false);
        return;
      }

      setStatus(data.steps || []);
      setStatus((prev) => [...prev, `Done! ${data.items_count} items extracted.`]);
      setTimeout(() => router.push("/"), 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setProcessing(false);
    }
  }

  const transcribeBusy = transcribeStep === "uploading" || transcribeStep === "transcribing";
  const transcribeDone = transcribeStep === "done";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <span className="text-blue-700 dark:text-blue-300 text-lg">⎈</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Helm</h1>
          </a>
          <a
            href="/"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            ← Back to dashboard
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Upload meeting
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Paste a transcript or upload an audio file. Helm extracts decisions and action items,
          validates each with Enkrypt, and stores them to your dashboard.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6 w-fit">
          <button
            type="button"
            onClick={() => switchMode("text")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === "text"
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            📝 Paste transcript
          </button>
          <button
            type="button"
            onClick={() => switchMode("audio")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === "audio"
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            🎙️ Upload audio
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Meeting title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Meeting title
            </label>
            <input
              id="title"
              type="text"
              placeholder="e.g. Sprint Planning — June 25"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={processing}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* ── Audio upload panel ── */}
          {mode === "audio" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Audio file
                <span className="ml-2 text-xs font-normal text-gray-400">
                  mp3 · wav · m4a · webm · max {MAX_MB} MB
                </span>
              </label>

              {/* Drop zone */}
              <div
                onClick={() => !transcribeBusy && fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-colors ${
                  audioFile
                    ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700"
                } ${transcribeBusy ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={transcribeBusy}
                />
                {audioFile ? (
                  <>
                    <span className="text-2xl">🎵</span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {audioFile.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioFile(null);
                        setTranscribeStep("idle");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">⬆️</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Click to choose an audio file
                    </p>
                  </>
                )}
              </div>

              {/* Transcription error */}
              {transcribeError && (
                <p className="text-sm text-red-600 dark:text-red-400">{transcribeError}</p>
              )}

              {/* Transcribe button */}
              {audioFile && !transcribeDone && (
                <button
                  type="button"
                  onClick={handleTranscribe}
                  disabled={transcribeBusy}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {transcribeBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      {transcribeStep === "uploading" ? "Uploading…" : "Transcribing with Whisper…"}
                    </span>
                  ) : (
                    "Transcribe audio"
                  )}
                </button>
              )}

              {/* Success banner after transcription */}
              {transcribeDone && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-300">
                  <span>✅</span>
                  <span>Transcribed — review the text below, then click Process.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Transcript textarea ── */}
          <div>
            <label
              htmlFor="transcript"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Transcript
            </label>
            <textarea
              id="transcript"
              placeholder="[00:00] Speaker: Paste your transcript here..."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              disabled={processing}
              rows={14}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:opacity-50 resize-y"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={processing || !title.trim() || !transcript.trim()}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Processing..." : "Process transcript"}
          </button>
        </form>

        {/* Pipeline status log */}
        {status.length > 0 && (
          <div className="mt-6 bg-gray-900 dark:bg-gray-800 rounded-xl p-4 font-mono text-sm">
            {status.map((step, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <span className="text-green-400 shrink-0">
                  {i === status.length - 1 && processing ? "⏳" : "✅"}
                </span>
                <span className="text-gray-300">{step}</span>
              </div>
            ))}
            {processing && (
              <div className="flex items-center gap-2 py-1 text-gray-500">
                <span className="animate-pulse">●</span>
                <span>
                  Working… {elapsed}s
                  {elapsed >= 20 && " — Gemini busy, retrying automatically"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Pipeline error */}
        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
