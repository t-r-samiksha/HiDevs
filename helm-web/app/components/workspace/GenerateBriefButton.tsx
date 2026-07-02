"use client";

/** Triggers project-brief generation via Member 1's brief API. */
export default function GenerateBriefButton({
  loading,
  onGenerate,
}: {
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <button
      onClick={onGenerate}
      disabled={loading}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? "Generating…" : "Generate brief"}
    </button>
  );
}
