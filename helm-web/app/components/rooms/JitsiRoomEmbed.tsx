"use client";

import { JitsiMeeting } from "@jitsi/react-sdk";

// Point NEXT_PUBLIC_JITSI_DOMAIN at a self-hosted Jitsi (where the first
// participant is moderator with no login) to remove the public meet.jit.si
// moderator sign-in wall. Defaults to public Jitsi so rooms work out of the box.
const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si";

/** Embeds a Jitsi meeting. The host joins as the named organiser. */
export default function JitsiRoomEmbed({
  roomName,
  displayName,
  email,
  isHost = false,
  onClose,
  onParticipantsChange,
  onDominantSpeakerChanged,
}: {
  roomName: string;
  displayName?: string;
  email?: string;
  isHost?: boolean;
  onClose?: () => void;
  /** Called with the deduped list of display names seen in the room so far
   *  (including the local user) whenever the roster changes. Used to give
   *  the transcription diarization step real names instead of voice-guessing. */
  onParticipantsChange?: (names: string[]) => void;
  /** Called every time Jitsi's own active-speaker detection changes who's
   *  dominant, with that person's current display name (best-effort — may be
   *  undefined momentarily). This is ground truth from the conference itself,
   *  so it's used to label transcript segments deterministically instead of
   *  asking an LLM to guess speakers from the audio. */
  onDominantSpeakerChanged?: (name: string | undefined) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <JitsiMeeting
        domain={JITSI_DOMAIN}
        roomName={roomName}
        userInfo={{ displayName: displayName || "Helm user", email: email || "" }}
        configOverwrite={{
          startWithAudioMuted: !isHost,
          prejoinPageEnabled: false,
          // On a self-hosted deployment these let the host drive the room; on
          // public meet.jit.si they're ignored (moderation is server-controlled).
          disableModeratorIndicator: false,
        }}
        interfaceConfigOverwrite={{ MOBILE_APP_PROMO: false }}
        onReadyToClose={onClose}
        onApiReady={(api) => {
          if (onParticipantsChange) {
            const names = new Set<string>();
            if (displayName) names.add(displayName);

            const emit = () => onParticipantsChange(Array.from(names));

            try {
              for (const p of api.getParticipantsInfo() as Array<{ displayName?: string }>) {
                if (p.displayName) names.add(p.displayName);
              }
              emit();
            } catch {
              /* getParticipantsInfo can throw before the conference is fully joined */
            }

            api.on("participantJoined", (p: { displayName?: string }) => {
              if (p?.displayName) {
                names.add(p.displayName);
                emit();
              }
            });
            api.on("displayNameChange", (p: { displayname?: string }) => {
              if (p?.displayname) {
                names.add(p.displayname);
                emit();
              }
            });
          }

          if (onDominantSpeakerChanged) {
            api.on("dominantSpeakerChanged", (p: { id?: string }) => {
              if (!p?.id) return;
              let name: string | undefined;
              try {
                name = api.getDisplayName(p.id) || undefined;
              } catch {
                /* participant may have already left */
              }
              onDominantSpeakerChanged(name);
            });
          }
        }}
        getIFrameRef={(node) => {
          node.style.height = "70vh";
          node.style.width = "100%";
        }}
      />
    </div>
  );
}
