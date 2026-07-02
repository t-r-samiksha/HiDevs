import Link from "next/link";
import { MailCheck } from "lucide-react";

/** Dashboard widget: count of follow-ups pending approval, links to the queue. */
export default function ApprovalQueueWidget({ count }: { count: number }) {
  return (
    <Link
      href="/followups"
      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400">
          <MailCheck size={18} />
        </span>
        <div>
          <p className="text-sm font-medium text-white">Approval queue</p>
          <p className="text-xs text-slate-400">
            {count > 0 ? `${count} follow-up${count !== 1 ? "s" : ""} awaiting approval` : "Nothing pending"}
          </p>
        </div>
      </div>
      {count > 0 && (
        <span className="rounded-full bg-amber-900 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
          {count}
        </span>
      )}
    </Link>
  );
}
