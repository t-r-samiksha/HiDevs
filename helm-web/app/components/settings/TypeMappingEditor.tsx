"use client";

const HELM_TYPES = ["decision", "action_item"];
const EXTERNAL_TYPES = ["Task", "Story", "Bug", "Epic"];

/** Maps Helm item types to an external tracker's types. */
export default function TypeMappingEditor({
  helmTypes = HELM_TYPES,
  externalTypes = EXTERNAL_TYPES,
}: {
  helmTypes?: string[];
  externalTypes?: string[];
}) {
  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Type mapping</p>
      <div className="space-y-2">
        {helmTypes.map((ht) => (
          <div key={ht} className="flex items-center gap-2 text-sm">
            <span className="w-28 capitalize text-slate-300">{ht.replace("_", " ")}</span>
            <span className="text-slate-600">→</span>
            <select className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {externalTypes.map((et) => (
                <option key={et}>{et}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
