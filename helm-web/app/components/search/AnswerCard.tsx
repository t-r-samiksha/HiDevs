// AI answer card (Ask mode). Shown above raw results when the search API
// returns an `answer`. Highlighted in blue per the design spec.

export default function AnswerCard({ answer }: { answer: string }) {
  return (
    <div className="mb-6 rounded-xl border border-blue-800 bg-blue-950/60 p-5">
      <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-blue-300">
        ✨ AI answer
      </p>
      <p className="text-sm leading-relaxed text-blue-100">{answer}</p>
    </div>
  );
}
