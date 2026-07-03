"use client";

/** Upload a document. Wire to Member 1's documents API when available. */
export default function DocumentUploadButton() {
  return (
    <button
      onClick={() => alert("Document upload arrives with Member 1's documents API.")}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      Upload document
    </button>
  );
}
