"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string[]>([]);
  const [error, setError] = useState("");

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

      // Redirect to dashboard after a moment
      setTimeout(() => router.push("/"), 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <span className="text-blue-700 dark:text-blue-300 text-lg">⎈</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Helm</h1>
            </a>
          </div>
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
          Upload meeting transcript
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Paste a transcript below. Helm will extract decisions and action items,
          validate each one with Enkrypt, and store them to your dashboard.
        </p>

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

          {/* Transcript */}
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

        {/* Pipeline status */}
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
                <span>Working... this takes 15–30 seconds</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
