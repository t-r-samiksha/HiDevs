// Strategic signal — a highlighted insight embedded in a weekly report.
export default function StrategicSignalCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-blue-800 bg-blue-950/50 px-3 py-2 text-sm text-blue-100">
      <span className="mr-1">💡</span>
      {text}
    </div>
  );
}
