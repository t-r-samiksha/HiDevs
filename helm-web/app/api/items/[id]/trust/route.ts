import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/items/[id]/trust
// Returns trust_score, review_state, and reconstructed Enkrypt check breakdown.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { data: item, error } = await supabase
      .from("items")
      .select("id, text, trust_score, review_state, source_quote, enkrypt_checks")
      .eq("id", (await params).id)
      .single();

    // Older rows / a DB that hasn't had the enkrypt_checks column added yet.
    if (error?.message?.includes("does not exist") || error?.message?.includes("Could not find")) {
      ({ data: item, error } = await supabase
        .from("items")
        .select("id, text, trust_score, review_state, source_quote")
        .eq("id", (await params).id)
        .single());
    }

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const ts = item.trust_score ?? 0;
    const stored = (item as { enkrypt_checks?: Record<string, unknown> }).enkrypt_checks;

    return NextResponse.json({
      item_id: item.id,
      trust_score: ts,
      review_state: item.review_state,
      // Real per-check Enkrypt breakdown when available (items processed after
      // the enkrypt_checks column was added). No fabricated data otherwise —
      // just the honest trust_score/review_state the pipeline actually stored.
      enkrypt_checks: stored ?? null,
      note: stored
        ? undefined
        : "Per-check Enkrypt breakdown not available for this item — only the aggregate trust_score/review_state were stored.",
      source_quote: item.source_quote || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
