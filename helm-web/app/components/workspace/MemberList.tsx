export type Member = { id: string; name: string; role: string };

const roleBadge: Record<string, string> = {
  vp: "bg-purple-900 text-purple-200",
  manager: "bg-blue-900 text-blue-200",
  employee: "bg-slate-800 text-slate-300",
};

export default function MemberList({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-slate-500">No members.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            {m.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">{m.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadge[m.role] ?? roleBadge.employee}`}>
              {m.role}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
