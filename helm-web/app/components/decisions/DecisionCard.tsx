import Link from "next/link";
import type { Item } from "../types";
import TrustScoreBadge from "../TrustScoreBadge";
import SupersedeChain from "./SupersedeChain";

/** A single decision entry in the decision log. */
export default function DecisionCard({
  decision,
  meetingTitle,
  meetingDate,
  overridesText,
}: {
  decision: Item;
  meetingTitle?: string;
  meetingDate?: string;
  overridesText?: string | null;
}) {
  return (
    <Link
      href={`/items/${decision.id}`}
      className="block rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-white">{decision.text}</p>
        <TrustScoreBadge score={decision.trust_score} />
      </div>

      {overridesText && <SupersedeChain overridesText={overridesText} />}

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {meetingTitle && <span>🎙️ {meetingTitle}</span>}
        {meetingDate && <span>{new Date(meetingDate).toLocaleDateString()}</span>}
      </div>
    </Link>
  );
}
