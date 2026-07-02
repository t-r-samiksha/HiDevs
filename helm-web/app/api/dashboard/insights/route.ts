import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

async function qdrantRawSearch(
  vector: number[],
  topK: number,
  filter?: object
): Promise<Array<{ score: number; payload: Record<string, any> }>> {
  const url = `${process.env.QDRANT_URL}/collections/${COLLECTION}/points/search`;
  const body: Record<string, any> = { vector, limit: topK, with_payload: true };
  if (filter) body.filter = filter;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.QDRANT_API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.result || []).map((r: any) => ({
    score: r.score ?? 0,
    payload: r.payload ?? {},
  }));
}

type Signal = {
  type: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  action_label: string;
};

// Signal 1: Decision Velocity
async function decisionVelocity(project_id: string): Promise<Signal | null> {
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
  const w1 = count(wk, 2 * wk);
  const w2 = count(2 * wk, 3 * wk);
  const priorAvg = (w1 + w2) / 2;
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

// Signal 2: Recurring Blocker Clusters
async function recurringBlockerClusters(project_id: string): Promise<Signal | null> {
  const { data } = await supabase
    .from("items")
    .select("dependency_hints")
    .eq("project_id", project_id)
    .not("dependency_hints", "is", null);

  const hints: string[] = [];
  for (const row of data || []) {
    if (Array.isArray(row.dependency_hints)) {
      hints.push(...row.dependency_hints.filter((h: string) => h?.trim()));
    }
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

// Signal 3: Commitment Drift
async function commitmentDrift(project_id: string): Promise<Signal | null> {
  const { data } = await supabase
    .from("items")
    .select("created_at, updated_at")
    .eq("project_id", project_id)
    .neq("status", "done")
    .not("deadline_iso", "is", null);

  if (!data || data.length === 0) return null;
  const drifted = data.filter((i) => {
    return (
      new Date(i.updated_at).getTime() - new Date(i.created_at).getTime() >
      3 * 24 * 60 * 60 * 1000
    );
  });
  if (drifted.length < 3) return null;

  return {
    type: "commitment_drift",
    title: "Commitment Drift Detected",
    description: `${drifted.length} open item(s) with deadlines have been modified multiple times without completion.`,
    severity: drifted.length >= 5 ? "critical" : "warning",
    action_label: "Review at-risk items",
  };
}

// Signal 4: Meeting ROI
async function meetingROI(project_id: string): Promise<Signal | null> {
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

// Signal 5: Cross-Project Opportunity
async function crossProjectOpportunity(project_id: string): Promise<Signal | null> {
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
    const crossProject = similar.filter(
      (r) => r.payload.project_id !== project_id && r.score > 0.88
    );
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

// GET /api/dashboard/insights?project_id=
export async function GET(req: NextRequest) {
  try {
    const project_id = req.nextUrl.searchParams.get("project_id");
    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const results = await Promise.allSettled([
      decisionVelocity(project_id),
      recurringBlockerClusters(project_id),
      commitmentDrift(project_id),
      meetingROI(project_id),
      crossProjectOpportunity(project_id),
    ]);

    const signals: Signal[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        signals.push(result.value);
      } else if (result.status === "rejected") {
        console.error("Insight signal error:", result.reason);
      }
    }

    // Sort: critical → warning → info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return NextResponse.json({ signals });
  } catch (error: any) {
    console.error("Insights error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
