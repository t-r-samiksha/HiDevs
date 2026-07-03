// Meeting ROI badge — items produced per meeting. Green = productive,
// amber = light, red = low-output.
export default function MeetingROIBadge({ title, itemCount }: { title: string; itemCount: number }) {
  const style =
    itemCount >= 3
      ? "bg-green-900 text-green-200"
      : itemCount >= 1
        ? "bg-amber-900 text-amber-200"
        : "bg-red-900 text-red-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${style}`}>
      <span className="max-w-[160px] truncate">{title}</span>
      <span className="font-semibold">· {itemCount}</span>
    </span>
  );
}
