/**
 * Canonical Mastra instance entry point (requested path).
 *
 * The real instance and ALL registrations (6 workflows, 2 agents, 4 scorers,
 * LibSQL storage) live in `lib/mastra/index.ts`, built earlier with the real
 * `createWorkflow`/`createStep` API from `@mastra/core`. This file re-exports
 * that single instance so the app has exactly ONE Mastra instance — registering
 * the same committed workflow objects in a second `new Mastra(...)` would
 * double-commit them. Nothing existing is modified; this only ADDS the entry.
 */
export { mastra, followupRuns } from "./mastra";
export type { FollowupRun } from "./mastra";

// Re-exported workflow handles (real Mastra workflows, already registered).
export { riskMonitorWorkflow } from "./mastra/workflows/risk-monitor-workflow";
export { followupHitlWorkflow } from "./mastra/workflows/followup-hitl-workflow";
export { reminderWorkflow } from "./mastra/workflows/reminder-workflow";
export { weeklyReportWorkflow } from "./mastra/workflows/weekly-report-workflow";
export { strategicInsightWorkflow } from "./mastra/workflows/strategic-insight-workflow";
export { pipelineSupervisorWorkflow } from "./mastra/workflows/pipeline-supervisor-workflow";
