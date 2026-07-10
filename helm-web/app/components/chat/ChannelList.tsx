"use client";

import { useState } from "react";
import { Hash, Plus, Trash2 } from "lucide-react";
import type { Channel } from "./types";
import UnreadBadge from "./UnreadBadge";
import DMList from "./DMList";
import NewChannelModal from "./NewChannelModal";

type DirectoryUser = { id: string; name: string; email?: string };

/** Left panel: channels + DMs for the current user. */
export default function ChannelList({
  channels,
  selectedId,
  onSelect,
  directory,
  onCreateChannel,
  onCreateDM,
  canDeleteChannel = false,
  onDeleteChannel,
}: {
  channels: Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  directory: DirectoryUser[];
  onCreateChannel: (name: string, memberIds: string[]) => void;
  onCreateDM: (userId: string, userName: string) => void;
  canDeleteChannel?: boolean;
  onDeleteChannel?: (channelId: string) => void;
}) {
  const rooms = channels.filter((c) => !c.is_dm);
  const dms = channels.filter((c) => c.is_dm);
  const [showNewChannel, setShowNewChannel] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <Group title="Channels" onAdd={() => setShowNewChannel(true)}>
        {rooms.map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === selectedId}
            onSelect={onSelect}
            icon={<Hash size={15} />}
            canDelete={canDeleteChannel}
            onDelete={onDeleteChannel}
          />
        ))}
      </Group>
      <DMList dms={dms} selectedId={selectedId} onSelect={onSelect} directory={directory} onCreateDM={onCreateDM} />

      {showNewChannel && (
        <NewChannelModal
          directory={directory}
          onClose={() => setShowNewChannel(false)}
          onCreate={(name, memberIds) => {
            onCreateChannel(name, memberIds);
            setShowNewChannel(false);
          }}
        />
      )}
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
  canDelete,
  onDelete,
}: {
  channel: Channel;
  active: boolean;
  onSelect: (id: string) => void;
  icon: React.ReactNode;
  canDelete?: boolean;
  onDelete?: (channelId: string) => void;
}) {
  return (
    <div
      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        active ? "bg-blue-600/15 text-blue-300" : "text-slate-300 hover:bg-slate-800"
      }`}
    >
      <button onClick={() => onSelect(channel.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0 text-slate-500">{icon}</span>
        <span className="flex-1 truncate">{channel.name}</span>
      </button>
      <UnreadBadge count={channel.unread} />
      {canDelete && onDelete && (
        <button
          onClick={() => {
            if (window.confirm(`Delete #${channel.name}? This can't be undone.`)) {
              onDelete(channel.id);
            }
          }}
          className="shrink-0 text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
          aria-label={`Delete #${channel.name}`}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
