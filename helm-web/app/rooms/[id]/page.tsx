"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import RoomControls from "../../components/rooms/RoomControls";

// Jitsi must run client-only (it injects an external iframe/script).
const JitsiRoomEmbed = dynamic(() => import("../../components/rooms/JitsiRoomEmbed"), {
  ssr: false,
  loading: () => <div className="h-[70vh] animate-pulse rounded-xl bg-slate-900" />,
});

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomName = params.id as string;
  const [ended, setEnded] = useState(false);

  function end() {
    setEnded(true);
    router.push("/");
  }

  const title = roomName.replace(/^helm-/, "").replace(/-[a-z0-9]{5}$/, "").replace(/-/g, " ") || "Meeting";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <RoomControls title={title} recording={!ended} onEnd={end} />
      {!ended && <JitsiRoomEmbed roomName={roomName} onClose={end} />}
      {ended && <p className="py-16 text-center text-sm text-slate-500">Meeting ended.</p>}
    </div>
  );
}
