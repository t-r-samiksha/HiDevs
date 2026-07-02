import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SYSTEM_PROMPT = `You are Helm's meeting intelligence assistant. Answer the user's question using ONLY the meeting context provided below.
Rules:
- Cite the source meeting inline as [Meeting Title].
- If a decision was superseded or overridden, mention it.
- Keep answers 2-4 sentences.
- If context is insufficient, say so honestly — never fabricate facts.`;

// POST /api/ask
// Body: { question: string, project_id?: string }
export async function POST(req: NextRequest) {
  try {
    const { question, project_id } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    let itemQuery = supabase
      .from("items")
      .select("text, type, owner, trust_score, deadline_raw, meetings(title, date)")
      .neq("review_state", "quarantined")
      .order("created_at", { ascending: false })
      .limit(40);

    if (project_id) itemQuery = itemQuery.eq("project_id", project_id);

    const { data: items, error } = await itemQuery;
    if (error) throw new Error(error.message);

    if (!items || items.length === 0) {
      return NextResponse.json({
        answer: "No meeting records found for this project yet. Upload a transcript to get started.",
        results: [],
      });
    }

    const context = items
      .map((item: any) => {
        const mtg = (item.meetings as any)?.title || "Unknown Meeting";
        const date = (item.meetings as any)?.date
          ? ` (${String((item.meetings as any).date).slice(0, 10)})`
          : "";
        const deadline = item.deadline_raw ? ` — due ${item.deadline_raw}` : "";
        const owner = item.owner ? ` — ${item.owner}` : "";
        return `[${mtg}${date}] ${item.type.toUpperCase()}: ${item.text}${owner}${deadline}`;
      })
      .join("\n");

    const { text: answer } = await generateText({
      model: google("gemini-2.5-flash"),
      system: SYSTEM_PROMPT,
      prompt: `Context:\n${context}\n\nQuestion: ${question}`,
    });

    const results = items.map((item: any) => ({
      text: item.text,
      type: item.type,
      owner: item.owner,
      meeting_title: (item.meetings as any)?.title || "",
      trust_score: item.trust_score,
    }));

    return NextResponse.json({ answer: answer.trim(), results });
  } catch (error: any) {
    console.error("Ask error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
