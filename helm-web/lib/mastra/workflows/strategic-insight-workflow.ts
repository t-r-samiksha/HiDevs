/**
 * Strategic-insight workflow — 5 insight engines as 5 real Mastra steps.
 * Ported from the inline /api/dashboard/insights route; that route now executes
 * this workflow instead of doing the work inline. Each step appends its signal
 * (or nothing) to a carried accumulator; the final step sorts by severity.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createClient } from "@supabase/supabase-js";
import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { z } from "zod";

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

const SignalSchema = z.object({
  type: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  action_label: z.string(),
});
type Signal = z.infer<typeof SignalSchema>;

const inputSchema = z.object({ project_id: z.string() });
const carrySchema = z.object({ project_id: z.string(), signals: z.array(SignalSchema) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function qdrantRawSearch(vector: number[], topK: number, filter?: object): Promise<Array<{ score: number; payload: Record<string, any> }>> {
  const url = `${process.env.QDRANT_URL}/collections/${COLLECTION}/points/search`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = { vector, limit: topK, with_payload: true };
  if (filter) body.filter = filter;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": process.env.QDRANT_API_KEY! },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.result || []).map((r: any) => ({ score: r.score ?? 0, payload: r.payload ?? {} }));
}

// ── The 5 engines ──────────────────────────────────────────────────────────
async function decisionVelocity(project_id: string): Promise<Signal | null> {
  const supabase = supa();
  const { data } = await supabase
    .from("items")
    .select("created_at")
    .eq("project_id", project_id)
    .eq("type", "decision")
    .gte("created_at", new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString());
  if (!data || data.length < 2) return null;
  const now = Date.now();
  const wk = 7 * 24 * 60 * 60 * 1000;
  const count = (from: number, to: number) =>
    data.filter((d) => {
      const age = now - new Date(d.created_at).getTime();
      return age >= from && age < to;
    }).length;
  const w0 = count(0, wk);
  const priorAvg = (count(wk, 2 * wk) + count(2 * wk, 3 * wk)) / 2;
  if (priorAvg === 0 || w0 / priorAvg > 0.6) return null;
  const drop = Math.round((1 - w0 / priorAvg) * 100);
  return {
    type: "decision_velocity",
    title: "Decision Velocity Drop",
    description: `Decisions this week (${w0}) dropped ${drop}% vs the prior 2-week average (${priorAvg.toFixed(1)}).`,
    severity: drop >= 60 ? "critical" : "warning",
    action_label: "Review recent meetings",
  };
}

async function recurringBlockerClusters(project_id: string): Promise<Signal | null> {
  const supabase = supa();
  const { data } = await supabase
    .from("items")
    .select("dependency_hints")
    .eq("project_id", project_id)
    .not("dependency_hints", "is", null);
  const hints: string[] = [];
  for (const row of data || []) {
    if (Array.isArray(row.dependency_hints)) hints.push(...row.dependency_hints.filter((h: string) => h?.trim()));
  }
  if (hints.length < 4) return null;
  const { embeddings } = await embedMany({ model: embeddingModel, values: hints });
  const cosine = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  let clusterCount = 0;
  let commonTheme = "";
  for (let i = 0; i < embeddings.length; i++) {
    const highSim = embeddings.filter((_, j) => j !== i && cosine(embeddings[i], embeddings[j]) > 0.8);
    if (highSim.length >= 3) {
      clusterCount++;
      if (!commonTheme) commonTheme = hints[i];
    }
  }
  if (clusterCount === 0) return null;
  return {
    type: "recurring_blocker",
    title: "Recurring Blocker Detected",
    description: `${clusterCount} dependency hint(s) cluster with >80% similarity. Common theme: "${commonTheme.slice(0, 80)}".`,
    severity: "warning",
    action_label: "View blockers",
  };
}

async function commitmentDrift(project_id: string): Promise<Signal | null> {
  const supabase = supa();
  const { data } = await supabase
    .from("items")
    .select("created_at, updated_at")
    .eq("project_id", project_id)
    .neq("status", "done")
    .not("deadline_iso", "is", null);
  if (!data || data.length === 0) return null;
  const drifted = data.filter(
    (i) => new Date(i.updated_at).getTime() - new Date(i.created_at).getTime() > 3 * 24 * 60 * 60 * 1000
  );
  if (drifted.length < 3) return null;
  return {
    type: "commitment_drift",
    title: "Commitment Drift Detected",
    description: `${drifted.length} open item(s) with deadlines have been modified multiple times without completion.`,
    severity: drifted.length >= 5 ? "critical" : "warning",
    action_label: "Review at-risk items",
  };
}

async function meetingROI(project_id: string): Promise<Signal | null> {
  const supabase = supa();
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title")
    .eq("project_id", project_id)
    .gte("date", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
  if (!meetings || meetings.length === 0) return null;
  const { data: items } = await supabase
    .from("items")
    .select("meeting_id")
    .in("meeting_id", meetings.map((m) => m.id));
  const withItems = new Set((items || []).map((i) => i.meeting_id));
  const zeroROI = meetings.filter((m) => !withItems.has(m.id));
  if (zeroROI.length === 0) return null;
  return {
    type: "meeting_roi",
    title: "Low-ROI Meetings Detected",
    description: `${zeroROI.length} meeting(s) in the past 2 weeks produced no decisions or action items: ${zeroROI
      .slice(0, 3)
      .map((m) => `"${m.title}"`)
      .join(", ")}.`,
    severity: "info",
    action_label: "Review meeting structure",
  };
}

async function crossProjectOpportunity(project_id: string): Promise<Signal | null> {
  const supabase = supa();
  const { data: recentDecisions } = await supabase
    .from("items")
    .select("id, text")
    .eq("project_id", project_id)
    .eq("type", "decision")
    .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .limit(3);
  if (!recentDecisions || recentDecisions.length === 0) return null;
  for (const decision of recentDecisions) {
    const { embedding } = await embed({ model: embeddingModel, value: decision.text });
    const similar = await qdrantRawSearch(embedding, 5);
    const crossProject = similar.filter((r) => r.payload.project_id !== project_id && r.score > 0.88);
    if (crossProject.length > 0) {
      const other = crossProject[0];
      return {
        type: "cross_project_opportunity",
        title: "Cross-Project Learning Opportunity",
        description: `"${decision.text.slice(0, 80)}" has a strong parallel in [${other.payload.meeting_title || "another project"}] (similarity: ${other.score.toFixed(2)}). Consider alignment.`,
        severity: "info",
        action_label: "View similar decisions",
      };
    }
  }
  return null;
}

// ── One step per engine, each appending to the carried signals ──────────────
function engineStep(id: string, engine: (pid: string) => Promise<Signal | null>) {
  return createStep({
    id,
    description: `Strategic insight engine: ${id}`,
    inputSchema: carrySchema,
    outputSchema: carrySchema,
    execute: async ({ inputData }) => {
      try {
        const signal = await engine(inputData.project_id);
        return signal ? { ...inputData, signals: [...inputData.signals, signal] } : inputData;
      } catch (e) {
        console.error(`Insight engine ${id} failed:`, e);
        return inputData;
      }
    },
  });
}

// Seed step turns { project_id } into the carried accumulator.
const seedStep = createStep({
  id: "seed",
  description: "Initialise the signal accumulator",
  inputSchema,
  outputSchema: carrySchema,
  execute: async ({ inputData }) => ({ project_id: inputData.project_id, signals: [] }),
});

const sortStep = createStep({
  id: "sort-signals",
  description: "Sort signals critical → warning → info",
  inputSchema: carrySchema,
  outputSchema: z.object({ signals: z.array(SignalSchema) }),
  execute: async ({ inputData }) => {
    const order = { critical: 0, warning: 1, info: 2 };
    const signals = [...inputData.signals].sort((a, b) => order[a.severity] - order[b.severity]);
    return { signals };
  },
});

export const strategicInsightWorkflow = createWorkflow({
  id: "strategic-insight",
  description: "Runs 5 strategic-intelligence engines (decision velocity, recurring blockers, commitment drift, meeting ROI, cross-project) and returns severity-sorted signals.",
  inputSchema,
  outputSchema: sortStep.outputSchema,
})
  .then(seedStep)
  .then(engineStep("decision-velocity", decisionVelocity))
  .then(engineStep("recurring-blocker", recurringBlockerClusters))
  .then(engineStep("commitment-drift", commitmentDrift))
  .then(engineStep("meeting-roi", meetingROI))
  .then(engineStep("cross-project", crossProjectOpportunity))
  .then(sortStep);

strategicInsightWorkflow.commit();
