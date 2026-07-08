// Real Mastra HITL workflow: draft nudge → Enkrypt policy check → suspend for
// human approval (real suspend()/resume()). Canonical definition in
// lib/mastra/workflows/followup-hitl-workflow.ts, registered in the instance.
export { followupHitlWorkflow } from "../mastra/workflows/followup-hitl-workflow";
export { followupHitlWorkflow as followupWorkflow } from "../mastra/workflows/followup-hitl-workflow";
