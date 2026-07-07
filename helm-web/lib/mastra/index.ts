/**
 * The deployed app's Mastra instance. Registers the real workflows, scorers and
 * agents so the running Next.js app executes genuine Mastra idioms
 * (createWorkflow / createStep / suspend / resume / evals) rather than
 * reimplementing them inline. API routes execute these via
 * `mastra.getWorkflow(...).createRun().start()`.
 *
 * A LibSQL file store persists workflow runs, suspended HITL state and run
 * history across restarts (and powers Mastra observability). The in-memory
 * `followupRuns` map below is kept as a fast path for resume within a session;
 * resolve also falls back to reconstructing the run from storage by runId.
 */
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";

import { followupAgent } from "./agents/followup-agent";
import { extractionAgent } from "./agents/extraction-agent";
import { followupHitlWorkflow } from "./workflows/followup-hitl-workflow";
import { riskMonitorWorkflow } from "./workflows/risk-monitor-workflow";
import { reminderWorkflow } from "./workflows/reminder-workflow";
import { weeklyReportWorkflow } from "./workflows/weekly-report-workflow";
import { strategicInsightWorkflow } from "./workflows/strategic-insight-workflow";
import { pipelineSupervisorWorkflow } from "./workflows/pipeline-supervisor-workflow";
import {
  itemCountScorer,
  ownerAccuracyScorer,
  typeAccuracyScorer,
  sourceQuotePresenceScorer,
} from "./scorers/extraction-scorers";

export const mastra = new Mastra({
  workflows: {
    riskMonitorWorkflow,
    followupHitlWorkflow,
    reminderWorkflow,
    weeklyReportWorkflow,
    strategicInsightWorkflow,
    pipelineSupervisorWorkflow,
  },
  agents: {
    followupAgent,
    extractionAgent,
  },
  scorers: {
    itemCountScorer,
    ownerAccuracyScorer,
    typeAccuracyScorer,
    sourceQuotePresenceScorer,
  },
  storage: new LibSQLStore({ id: "helm-mastra", url: "file:./helm-mastra.db" }),
});

/**
 * Live suspended follow-up HITL runs, keyed by escalation_id. Holding the Run
 * object across requests lets /api/followup/resolve call run.resume() on the
 * exact run that /api/followup/draft suspended — real suspend/resume with no
 * external storage adapter.
 */
export type FollowupRun = Awaited<ReturnType<typeof followupHitlWorkflow.createRun>>;
export const followupRuns = new Map<string, FollowupRun>();
