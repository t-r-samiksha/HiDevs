import Link from "next/link";

/** Alert card for a contradiction between two decisions. */
export default function ContradictionAlert({
  description,
  itemAId,
  itemBId,
}: {
  description: string;
  itemAId: string;
  itemBId: string;
}) {
  return (
    <div className="rounded-xl border border-amber-800 bg-amber-950 px-4 py-3">
      <p className="text-sm font-medium text-amber-200">⚠️ Contradiction</p>
      <p className="mt-1 text-sm text-amber-300">{description}</p>
      <div className="mt-2 flex gap-3 text-xs">
        <Link href={`/items/${itemAId}`} className="text-blue-400 hover:underline">
          View decision A →
        </Link>
        <Link href={`/items/${itemBId}`} className="text-blue-400 hover:underline">
          View decision B →
        </Link>
      </div>
    </div>
  );
}
