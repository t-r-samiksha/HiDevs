// Real Mastra workflow (createWorkflow/createStep): fetch open items → evaluate
// risk rules (deadline proximity, silence, dependency blocks) → update statuses.
// Canonical definition lives in lib/mastra/workflows/ and is registered in the
// Mastra instance. Re-exported here at the requested path.
export { riskMonitorWorkflow } from "../mastra/workflows/risk-monitor-workflow";
