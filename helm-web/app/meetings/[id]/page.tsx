"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Meeting = {
  id: string;
  title: string;
  date: string;
  transcript_text: string | null;
  summary: string | null;
};

type Item = {
  id: string;
  type: string;
  text: string;
  owner: string | null;
  deadline_raw: string | null;
  status: string;
  trust_score: number;
  review_state: string;
  source_quote: string | null;
  source_timestamp: number | null;
  dependency_hints: string[];
  supersedes_hint: string | null;
};

const statusStyles: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  at_risk: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const trustColor = (score: number) => {
  if (score >= 0.85) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (score >= 0.6) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
};

export default function MeetingDetailPage() {
  const params = useParams();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [meetingRes, itemsRes] = await Promise.all([
        supabase.from("meetings").select("*").eq("id", meetingId).single(),
        supabase
          .from("items")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("created_at", { ascending: true }),
      ]);

      setMeeting(meetingRes.data);
      setItems(itemsRes.data || []);
      setLoading(false);
    }
    fetchData();
  }, [meetingId]);

  async function markDone(itemId: string) {
    await supabase.from("items").update({ status: "done" }).eq("id", itemId);
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: "done" } : it))
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading meeting...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Meeting not found.</p>
      </div>
    );
  }

  const decisions = items.filter((i) => i.type === "decision");
  const actionItems = items.filter((i) => i.type === "action_item");

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <Link
          href="/meetings"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← All meetings
        </Link>
        {/* Meeting info */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{meeting.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {new Date(meeting.date).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {" · "}
            {items.length} items extracted
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Transcript */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              📝 Transcript
            </h3>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 max-h-[600px] overflow-y-auto">
              {meeting.transcript_text ? (
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {meeting.transcript_text}
                </pre>
              ) : (
                <p className="text-sm text-gray-400">No transcript available.</p>
              )}
            </div>
          </div>

          {/* Right: Extracted items */}
          <div>
            {/* Decisions */}
            {decisions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  📌 Decisions ({decisions.length})
                </h3>
                {decisions.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-3"
                  >
                    <p className="text-sm text-gray-900 dark:text-white mb-2">{item.text}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className={`px-2 py-0.5 rounded-full ${trustColor(item.trust_score)}`}>
                        🛡️ {item.trust_score}
                      </span>
                      {item.supersedes_hint && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                          ↩️ {item.supersedes_hint}
                        </span>
                      )}
                    </div>
                    {item.source_quote && (
                      <p className="text-xs text-gray-400 italic mt-2 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                        &quot;{item.source_quote}&quot;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action items */}
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              📋 Action items ({actionItems.length})
            </h3>
            {actionItems.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-3"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p
                    className={`text-sm leading-relaxed ${
                      item.status === "done"
                        ? "text-gray-400 dark:text-gray-600 line-through"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {item.text}
                  </p>
                  <span
                    className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                      statusStyles[item.status] || statusStyles.open
                    }`}
                  >
                    {item.status.replace("_", " ")}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                  {item.owner && <span>👤 {item.owner}</span>}
                  {item.deadline_raw && <span>🕐 {item.deadline_raw}</span>}
                  <span className={`px-2 py-0.5 rounded-full ${trustColor(item.trust_score)}`}>
                    🛡️ {item.trust_score}
                  </span>
                </div>

                {/* Dependencies */}
                {item.dependency_hints?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.dependency_hints.map((h, i) => (
                      <span
                        key={i}
                        className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full"
                      >
                        🔗 {h}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source quote */}
                {item.source_quote && (
                  <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 dark:border-gray-700 pl-2 mb-2">
                    &quot;{item.source_quote}&quot;
                  </p>
                )}

                {/* Mark done button */}
                {item.status !== "done" && (
                  <button
                    onClick={() => markDone(item.id)}
                    className="text-xs px-3 py-1 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                  >
                    ✓ Mark done
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
