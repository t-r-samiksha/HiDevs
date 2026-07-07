/**
 * Weekly-report workflow. Ported to a real Mastra workflow and executed live
 * from POST /api/reports/weekly/generate: aggregate → persist → Slack.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const inputSchema = z.object({ project_id: z.string() });

const aggregateStep = createStep({
  id: "aggregate-week",
  description: "Aggregate the last 7 days of meetings + items into a report row",
  inputSchema,
  outputSchema: z.object({
    project_id: z.string(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    report: z.any(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    zeroROI: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const supabase = supa();
    const { project_id } = inputData;
    const now = new Date();
    const periodEnd = now.toISOString();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: meetings }, { data: items }] = await Promise.all([
      supabase.from("meetings").select("id, title").eq("project_id", project_id).gte("date", periodStart),
      supabase
        .from("items")
        .select("id, text, type, status, meeting_id, created_at")
        .eq("project_id", project_id)
        .gte("updated_at", periodStart),
    ]);

    const allMeetings = meetings || [];
    const allItems = items || [];
    const itemsByMeeting = new Map<string, number>();
    for (const it of allItems) {
      if (it.meeting_id) itemsByMeeting.set(it.meeting_id, (itemsByMeeting.get(it.meeting_id) || 0) + 1);
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

    const { error } = await supabase.from("reports").insert({
      project_id,
      week_start: periodStart.slice(0, 10),
      week_end: periodEnd.slice(0, 10),
      meetings_count: report.meetings_count,
      tasks_completed: report.items_completed,
      tasks_pending: report.items_pending,
      major_decisions: report.major_decisions,
      meeting_roi_scores: report.meeting_roi_scores,
    });
    if (error) throw new Error(error.message);

    const zeroROI = meeting_roi_scores.filter((m) => m.items_produced === 0).map((m) => `"${m.meeting_title}"`);
    return { project_id, report, zeroROI };
  },
});

const notifyStep = createStep({
  id: "notify-slack",
  description: "Push the weekly report summary to Slack (if configured)",
  inputSchema: aggregateStep.outputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    report: z.any(),
  }),
  execute: async ({ inputData }) => {
    const { report, zeroROI } = inputData;
    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackUrl) {
      const lines = [
        `*Helm Weekly Report* (${report.period_start.slice(0, 10)} → ${report.period_end.slice(0, 10)})`,
        `• Meetings held: ${report.meetings_count}`,
        `• Items completed: ${report.items_completed}`,
        `• Items pending: ${report.items_pending}`,
        `• Items at risk/blocked: ${report.items_at_risk}`,
      ];
      if (report.major_decisions.length > 0) {
        lines.push(`• Key decisions:\n  - ${report.major_decisions.slice(0, 3).join("\n  - ")}`);
      }
      if (zeroROI.length > 0) lines.push(`• :warning: Zero-output meetings: ${zeroROI.join(", ")}`);
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lines.join("\n") }),
      }).catch((e) => console.error("Slack notification failed:", e));
    }
    return { success: true, report };
  },
});

export const weeklyReportWorkflow = createWorkflow({
  id: "weekly-report",
  description: "Aggregates a project's last 7 days into a persisted weekly report and pushes it to Slack.",
  inputSchema,
  outputSchema: notifyStep.outputSchema,
})
  .then(aggregateStep)
  .then(notifyStep);

weeklyReportWorkflow.commit();
