import GenerateBriefButton from "./GenerateBriefButton";

/** Shows the generated project brief with a generate/regenerate button. */
export default function ProjectBriefView({
  brief,
  loading,
  onGenerate,
}: {
  brief: string | null;
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      {brief ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{brief}</p>
      ) : (
        <p className="text-sm text-slate-500">No brief generated yet.</p>
      )}
      <div className="mt-4">
        <GenerateBriefButton loading={loading} onGenerate={onGenerate} />
      </div>
    </div>
  );
}
