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
}: {
  roomName: string;
  displayName?: string;
  email?: string;
  isHost?: boolean;
  onClose?: () => void;
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
        getIFrameRef={(node) => {
          node.style.height = "70vh";
          node.style.width = "100%";
        }}
      />
    </div>
  );
}
