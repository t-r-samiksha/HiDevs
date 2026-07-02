import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/reports/weekly/generate — manually trigger weekly report for a project
export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json();

    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const now = new Date();
    const periodEnd = now.toISOString();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: meetings }, { data: items }] = await Promise.all([
      supabase
        .from("meetings")
        .select("id, title")
        .eq("project_id", project_id)
        .gte("date", periodStart),
      supabase
        .from("items")
        .select("id, text, type, status, meeting_id, created_at")
        .eq("project_id", project_id)
        .gte("updated_at", periodStart),
    ]);

    const allMeetings = meetings || [];
    const allItems = items || [];

    const itemsByMeeting = new Map<string, number>();
    for (const item of allItems) {
      if (item.meeting_id) {
        itemsByMeeting.set(item.meeting_id, (itemsByMeeting.get(item.meeting_id) || 0) + 1);
      }
    }

    const meeting_roi_scores = allMeetings.map((m) => ({
      meeting_id: m.id,
      meeting_title: m.title,
      items_produced: itemsByMeeting.get(m.id) || 0,
    }));

    const major_decisions = allItems
      .filter((i) => i.type === "decision" && i.created_at >= periodStart)
      .map((i) => i.text)
      .slice(0, 10);

    const report = {
      project_id,
      period_start: periodStart,
      period_end: periodEnd,
      meetings_count: allMeetings.length,
      items_completed: allItems.filter((i) => i.status === "done").length,
      items_pending: allItems.filter((i) => ["open", "in_progress"].includes(i.status)).length,
      items_at_risk: allItems.filter((i) => ["at_risk", "blocked"].includes(i.status)).length,
      major_decisions,
      meeting_roi_scores,
      generated_at: now.toISOString(),
    };

    // Map to schema columns: week_start/week_end (DATE), tasks_completed/tasks_pending
    const { error: insertErr } = await supabase.from("reports").insert({
      project_id,
      week_start: periodStart.slice(0, 10),
      week_end: periodEnd.slice(0, 10),
      meetings_count: report.meetings_count,
      tasks_completed: report.items_completed,
      tasks_pending: report.items_pending,
      major_decisions: report.major_decisions,
      meeting_roi_scores: report.meeting_roi_scores,
    });
    if (insertErr) throw new Error(insertErr.message);

    // Slack notification
    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackUrl) {
      const zeroROI = meeting_roi_scores
        .filter((m) => m.items_produced === 0)
        .map((m) => `"${m.meeting_title}"`);

      const lines = [
        `*Helm Weekly Report* (${periodStart.slice(0, 10)} → ${periodEnd.slice(0, 10)})`,
        `• Meetings held: ${report.meetings_count}`,
        `• Items completed: ${report.items_completed}`,
        `• Items pending: ${report.items_pending}`,
        `• Items at risk/blocked: ${report.items_at_risk}`,
      ];
      if (major_decisions.length > 0) {
        lines.push(`• Key decisions:\n  - ${major_decisions.slice(0, 3).join("\n  - ")}`);
      }
      if (zeroROI.length > 0) {
        lines.push(`• :warning: Zero-output meetings: ${zeroROI.join(", ")}`);
      }

      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lines.join("\n") }),
      }).catch((e) => console.error("Slack notification failed:", e));
    }

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error("Weekly report generate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
