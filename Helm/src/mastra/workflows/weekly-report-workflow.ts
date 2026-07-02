import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ReportInputSchema = z.object({
  project_id: z.string(),
});

const MeetingROISchema = z.object({
  meeting_id: z.string(),
  meeting_title: z.string(),
  items_produced: z.number(),
});

const ReportSchema = z.object({
  project_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  meetings_count: z.number(),
  items_completed: z.number(),
  items_pending: z.number(),
  items_at_risk: z.number(),
  major_decisions: z.array(z.string()),
  meeting_roi_scores: z.array(MeetingROISchema),
  generated_at: z.string(),
});

// ---------------------------------------------------------------------------
// Step 1: Aggregate meetings and items from the past 7 days
// ---------------------------------------------------------------------------
const aggregateDataStep = createStep({
  id: "aggregate-data",
  description: "Pull last 7 days of meetings and items from Supabase and compute metrics",
  inputSchema: ReportInputSchema,
  outputSchema: ReportSchema,
  execute: async ({ inputData }) => {
    const { project_id } = inputData;
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

    const allItems = items || [];
    const allMeetings = meetings || [];

    const itemsByMeeting = new Map<string, number>();
    for (const item of allItems) {
      if (item.meeting_id) {
        itemsByMeeting.set(item.meeting_id, (itemsByMeeting.get(item.meeting_id) || 0) + 1);
      }
    }

    return {
      project_id,
      period_start: periodStart,
      period_end: periodEnd,
      meetings_count: allMeetings.length,
      items_completed: allItems.filter((i) => i.status === "done").length,
      items_pending: allItems.filter((i) => ["open", "in_progress"].includes(i.status)).length,
      items_at_risk: allItems.filter((i) => ["at_risk", "blocked"].includes(i.status)).length,
      major_decisions: allItems
        .filter((i) => i.type === "decision" && i.created_at >= periodStart)
        .map((i) => i.text)
        .slice(0, 10),
      meeting_roi_scores: allMeetings.map((m) => ({
        meeting_id: m.id,
        meeting_title: m.title,
        items_produced: itemsByMeeting.get(m.id) || 0,
      })),
      generated_at: now.toISOString(),
    };
  },
});

// ---------------------------------------------------------------------------
// Step 2: Persist to Supabase reports table and notify Slack
// ---------------------------------------------------------------------------
const persistAndNotifyStep = createStep({
  id: "persist-and-notify",
  description: "Store the report in Supabase and send a Slack summary",
  inputSchema: ReportSchema,
  outputSchema: ReportSchema,
  execute: async ({ inputData }) => {
    await supabase.from("reports").insert({
      project_id: inputData.project_id,
      report_type: "weekly",
      period_start: inputData.period_start,
      period_end: inputData.period_end,
      meetings_count: inputData.meetings_count,
      items_completed: inputData.items_completed,
      items_pending: inputData.items_pending,
      items_at_risk: inputData.items_at_risk,
      major_decisions: inputData.major_decisions,
      meeting_roi_scores: inputData.meeting_roi_scores,
      generated_at: inputData.generated_at,
    });

    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackUrl) {
      const zeroROI = inputData.meeting_roi_scores
        .filter((m) => m.items_produced === 0)
        .map((m) => `"${m.meeting_title}"`);

      const lines = [
        `*Helm Weekly Report* (${inputData.period_start.slice(0, 10)} → ${inputData.period_end.slice(0, 10)})`,
        `• Meetings held: ${inputData.meetings_count}`,
        `• Items completed: ${inputData.items_completed}`,
        `• Items pending: ${inputData.items_pending}`,
        `• Items at risk/blocked: ${inputData.items_at_risk}`,
      ];
      if (inputData.major_decisions.length > 0) {
        lines.push(
          `• Key decisions:\n  - ${inputData.major_decisions.slice(0, 3).join("\n  - ")}`
        );
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

    return inputData;
  },
});

export const weeklyReportWorkflow = createWorkflow({
  id: "weekly-report",
  name: "Weekly Report Workflow",
  description:
    "Aggregates the past 7 days of meeting activity into a report (meetings count, " +
    "item statuses, major decisions, per-meeting ROI). Persists to Supabase reports " +
    "table and sends a Slack summary if SLACK_WEBHOOK_URL is configured.",
  inputSchema: ReportInputSchema,
  outputSchema: ReportSchema,
})
  .then(aggregateDataStep)
  .then(persistAndNotifyStep);

weeklyReportWorkflow.commit();
