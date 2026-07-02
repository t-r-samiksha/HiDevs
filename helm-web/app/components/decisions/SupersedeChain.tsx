// Visual "overrides → <older decision>" chain shown on a superseding decision.
export default function SupersedeChain({ overridesText }: { overridesText: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5 text-xs">
      <span className="font-medium text-amber-400">overrides</span>
      <span className="text-slate-500">→</span>
      <span className="truncate text-slate-300">{overridesText}</span>
    </div>
  );
}
