"use client";

import { Hash, Plus } from "lucide-react";
import type { Channel } from "./mockData";
import UnreadBadge from "./UnreadBadge";
import DMList from "./DMList";

/** Left panel: channels + DMs for the current user. */
export default function ChannelList({
  channels,
  selectedId,
  onSelect,
}: {
  channels: Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rooms = channels.filter((c) => !c.is_dm);
  const dms = channels.filter((c) => c.is_dm);

  return (
    <div className="flex h-full flex-col">
      <Group title="Channels" onAdd={() => alert("New channel — coming with Member 1's chat tables.")}>
        {rooms.map((c) => (
          <ChannelRow key={c.id} channel={c} active={c.id === selectedId} onSelect={onSelect} icon={<Hash size={15} />} />
        ))}
      </Group>
      <DMList dms={dms} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

function Group({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <button onClick={onAdd} className="text-slate-500 hover:text-slate-200" aria-label={`Add ${title}`}>
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ChannelRow({
  channel,
  active,
  onSelect,
  icon,
}: {
  channel: Channel;
  active: boolean;
  onSelect: (id: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onSelect(channel.id)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
        active ? "bg-blue-600/15 text-blue-300" : "text-slate-300 hover:bg-slate-800"
      }`}
    >
      <span className="shrink-0 text-slate-500">{icon}</span>
      <span className="flex-1 truncate">{channel.name}</span>
      <UnreadBadge count={channel.unread} />
    </button>
  );
}
