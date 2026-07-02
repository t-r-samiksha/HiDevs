import { FileText } from "lucide-react";
import DocumentUploadButton from "./DocumentUploadButton";

export type Document = { id: string; name: string; file_url: string };

/** Project documents. Mock/empty until Member 1's documents table lands. */
export default function DocumentList({ documents }: { documents: Document[] }) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
        <p className="text-sm text-slate-500">No documents yet.</p>
        <div className="mt-3">
          <DocumentUploadButton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((d) => (
        <a
          key={d.id}
          href={d.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-600"
        >
          <FileText size={18} className="text-slate-400" />
          <span className="truncate text-sm text-slate-200">{d.name}</span>
        </a>
      ))}
      <div className="pt-2">
        <DocumentUploadButton />
      </div>
    </div>
  );
}
