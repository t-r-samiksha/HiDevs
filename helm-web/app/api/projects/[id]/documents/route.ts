import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "@ai-sdk/google";
import { embedMany } from "ai";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const DOCS_COLLECTION = "documents";
const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;

async function ensureDocumentsCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${DOCS_COLLECTION}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
    body: JSON.stringify({ vectors: { size: 3072, distance: "Cosine" } }),
  });
  // 409 Conflict = already exists, that's fine
  if (!res.ok && res.status !== 409) {
    console.error("Failed to create documents collection:", res.status);
  }
}

function chunkText(text: string, maxChars = 500): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    // Try to break at a sentence boundary within the window
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      if (lastPeriod > start + maxChars / 2) end = lastPeriod + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return chunks;
}

// GET /api/projects/[id]/documents — list documents for a project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select("id, name, file_url, uploaded_by, uploaded_at")
      .eq("project_id", (await params).id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ documents: [] });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ documents: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/projects/[id]/documents — upload a document
// Multipart: file, uploaded_by (user_id)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const projectId = (await params).id;
    const formData = await req.formData();
    const file = formData.get("file");
    const uploadedBy = formData.get("uploaded_by") as string | null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const documentId = randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${projectId}/${documentId}/${safeName}`;

    // Ensure storage bucket exists
    await supabase.storage.createBucket("documents", { public: false }).catch(() => {});

    // Upload to Supabase Storage
    const { error: storageErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);
    const fileUrl = urlData?.publicUrl ?? null;

    // Insert document record
    const { error: dbErr } = await supabase.from("documents").insert({
      id: documentId,
      project_id: projectId,
      name: file.name,
      file_url: fileUrl,
      uploaded_by: uploadedBy || null,
    });

    if (dbErr) throw new Error(dbErr.message);

    // Text extraction (.txt / .md only; skip binary formats)
    const ext = file.name.split(".").pop()?.toLowerCase();
    let chunksStored = 0;

    if (ext === "txt" || ext === "md") {
      const text = await file.text();
      const chunks = chunkText(text, 500);

      if (chunks.length > 0) {
        await ensureDocumentsCollection();

        const { embeddings } = await embedMany({ model: embeddingModel, values: chunks });

        const points = chunks.map((chunk, i) => ({
          id: randomUUID(),
          vector: embeddings[i],
          payload: {
            document_id: documentId,
            project_id: projectId,
            chunk_text: chunk,
            document_name: file.name,
          },
        }));

        const qdrantRes = await fetch(`${QDRANT_URL}/collections/${DOCS_COLLECTION}/points`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
          body: JSON.stringify({ points }),
        });

        if (!qdrantRes.ok) {
          console.error("Qdrant upsert failed:", await qdrantRes.text().catch(() => ""));
        } else {
          chunksStored = chunks.length;
        }
      }
    }

    return NextResponse.json(
      {
        document_id: documentId,
        name: file.name,
        file_url: fileUrl,
        chunks_stored: chunksStored,
        text_extracted: chunksStored > 0,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Document upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
