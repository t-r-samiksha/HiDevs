export default function WorkspaceHeader({
  name,
  description,
  memberCount,
  meetingCount,
}: {
  name: string;
  description: string | null;
  memberCount: number;
  meetingCount: number;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-white">{name}</h1>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span>{memberCount} members</span>
        <span>{meetingCount} meetings</span>
      </div>
    </div>
  );
}
