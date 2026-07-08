// Real Mastra workflow: aggregate last 7 days → persist report → push Slack.
// Canonical definition in lib/mastra/workflows/, registered in the instance.
export { weeklyReportWorkflow } from "../mastra/workflows/weekly-report-workflow";
