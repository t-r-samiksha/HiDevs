"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DocumentUploadButton({
  projectId,
  onUploaded,
}: {
  projectId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const formData = new FormData();
      formData.append("file", file);
      if (user?.id) formData.append("uploaded_by", user.id);

      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert("Upload failed: " + (data.error || "unknown error"));
        return;
      }

      onUploaded();
    } catch (err) {
      console.error("Document upload failed:", err);
      alert("Upload failed — see console for details.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "Upload document"}
      </button>
    </>
  );
}
