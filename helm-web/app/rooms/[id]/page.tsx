"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, Radio } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RoomControls from "../../components/rooms/RoomControls";
import { useMeetingRecorder } from "../../components/rooms/useMeetingRecorder";

// Jitsi must run client-only (it injects an external iframe/script).
const JitsiRoomEmbed = dynamic(() => import("../../components/rooms/JitsiRoomEmbed"), {
  ssr: false,
  loading: () => <div className="h-[70vh] animate-pulse rounded-xl bg-slate-900" />,
});

type RoomInfo = { id: string; created_by: string | null; meetings?: { title?: string } | null };

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomName = params.id as string;

  const [ended, setEnded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("Helm user");
  const [email, setEmail] = useState<string>("");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [autoTried, setAutoTried] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const recorder = useMeetingRecorder();
  // Roster of display names seen in the room, kept in a ref (not state) so
  // endMeeting — memoized once via useCallback — always reads the latest
  // value instead of a stale closure from when it was created.
  const participantsRef = useRef<string[]>([]);
  // Timeline of Jitsi's own dominant-speaker changes, timestamped relative to
  // recorder.startedAt so they line up with Whisper's segment timestamps on
  // the resulting audio blob. Reset whenever a recording (re)starts, since a
  // new MediaRecorder means a new time origin.
  const speakerTimelineRef = useRef<Array<{ atMs: number; name: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          setEmail(user.email ?? "");
          const { data: profile } = await supabase.from("users").select("name").eq("id", user.id).single();
          if (profile?.name) setDisplayName(profile.name);
        }
        const res = await fetch(`/api/rooms/${roomName}`);
        if (res.ok) setRoom(await res.json());
      } finally {
        setLoaded(true);
      }
    })();
  }, [roomName]);

  // The starter of the meeting is its host — no separate login required. We
  // mark the browser that clicked "Start" (localStorage) so host detection
  // never depends on a Supabase session or the rooms.created_by column. The
  // auth/created_by match is kept as a secondary signal for other devices.
  const [isHostLocal, setIsHostLocal] = useState(false);
  useEffect(() => {
    try {
      setIsHostLocal(localStorage.getItem(`helm_host_${roomName}`) === "1");
    } catch {
      /* localStorage unavailable */
    }
  }, [roomName]);
  const isHost = isHostLocal || (!!userId && !!room?.created_by && room.created_by === userId);

  const title =
    room?.meetings?.title ||
    roomName.replace(/^helm-/, "").replace(/-[a-z0-9]{5}$/, "").replace(/-/g, " ") ||
    "Meeting";

  const jitsiDomain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si";
  const directJoinUrl = `https://${jitsiDomain}/${roomName}`;

  // Auto-record on its own: mic capture starts hands-free (getUserMedia needs a
  // one-time permission grant but no click). Capturing the OTHER participants
  // needs the "share tab audio" picker, which the browser only allows from a
  // click — that's the one-tap "Capture everyone" upgrade below.
  useEffect(() => {
    if (isHost && loaded && !ended && !recorder.recording && !autoTried) {
      setAutoTried(true);
      speakerTimelineRef.current = [];
      recorder.start("mic").catch(() => {});
    }
  }, [isHost, loaded, ended, recorder, autoTried]);

  // End the meeting: stop recording, then transcribe + extract via the pipeline,
  // link the resulting meeting to this room, and land on it.
  const endMeeting = useCallback(async () => {
    if (recorder.recording) {
      setProcessing("Finalising recording…");
      const blob = await recorder.stop();
      if (blob) {
        try {
          setProcessing("Saving & transcribing the meeting…");
          const form = new FormData();
          form.append("file", blob, "meeting.webm");
          form.append("title", title);
          // Deterministic save: this endpoint ALWAYS creates the meeting + saves
          // the transcript, then extracts items best-effort. The meeting shows up
          // in Meetings even if extraction is thin.
          const res = await fetch("/api/meetings/record", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.meeting_id) {
            if (room?.id) {
              await fetch(`/api/rooms/${room.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "ended", meeting_id: data.meeting_id }),
              }).catch(() => {});
            }
            setEnded(true);
            router.push(`/meetings/${data.meeting_id}`);
            return;
          }
          setProcessing(`Save failed: ${data.error || "unknown error"}. Ending meeting.`);
        } catch {
          setProcessing("Could not save the recording. Ending meeting.");
        }
      }
    }

    // No recording (or it failed) — just close the room out.
    if (isHost && room?.id) {
      await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      }).catch(() => {});
    }
    setEnded(true);
    router.push("/");
  }, [recorder, title, room, isHost, router]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <RoomControls title={title} recording={recorder.recording} onEnd={endMeeting} isHost={isHost} />

      {/* Host recording banner — auto-records the mic; one tap upgrades to
          capturing every participant via the shared tab's audio. */}
      {isHost && !ended && !processing && (
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {recorder.recording ? (
              <span className="flex items-center gap-2 text-emerald-400">
                <Radio size={15} className="animate-pulse" />
                {recorder.mode === "full"
                  ? "Recording everyone — auto-saved & transcribed when you end the meeting."
                  : "Recording — auto-saved & transcribed when you end the meeting."}
              </span>
            ) : recorder.error ? (
              <span className="flex items-center gap-2 text-amber-400">
                {recorder.error} Allow microphone access, then retry.
              </span>
            ) : (
              <span className="text-slate-300">Starting recording…</span>
            )}

            <div className="flex shrink-0 items-center gap-2">
              {/* Retry mic recording (no screen share needed) if auto-start was blocked. */}
              {!recorder.recording && (
                <button
                  onClick={() => recorder.start("mic").catch(() => {})}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {recorder.error ? "Retry recording" : "Enable recording"}
                </button>
              )}
              {/* Optional upgrade: capture every participant via shared tab audio. */}
              {recorder.mode !== "full" && (
                <button
                  onClick={() => {
                    speakerTimelineRef.current = [];
                    recorder.start("full").catch(() => {});
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Capture everyone
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {processing && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-900 bg-blue-950/60 px-4 py-3 text-sm text-blue-200">
          <Loader2 size={15} className="animate-spin" />
          {processing}
        </div>
      )}

      {!ended && loaded && (
        <>
          <JitsiRoomEmbed
            roomName={roomName}
            displayName={displayName}
            email={email}
            isHost={isHost}
            onClose={endMeeting}
            onParticipantsChange={(names) => {
              participantsRef.current = names;
            }}
            onDominantSpeakerChanged={(name) => {
              if (recorder.startedAt == null) return;
              speakerTimelineRef.current.push({
                atMs: Date.now() - recorder.startedAt,
                name: name || "Unknown speaker",
              });
            }}
          />
          <p className="mt-2 text-center text-xs text-slate-500">
            Meeting not loading? An ad-blocker or privacy shield may be blocking Jitsi.{" "}
            <a href={directJoinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Open the meeting in a new tab ↗
            </a>
          </p>
        </>
      )}
      {!ended && !loaded && <div className="h-[70vh] animate-pulse rounded-xl bg-slate-900" />}
      {ended && !processing && (
        <p className="py-16 text-center text-sm text-slate-500">Meeting ended.</p>
      )}
    </div>
  );
}
