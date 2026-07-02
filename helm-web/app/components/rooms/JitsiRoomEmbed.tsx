"use client";

import { JitsiMeeting } from "@jitsi/react-sdk";

/**
 * Embeds a Jitsi meeting. Defaults to the public meet.jit.si so rooms work
 * without Member 1's self-hosted Jitsi/Jibri setup; point `domain` at the
 * self-hosted instance once it's available.
 */
export default function JitsiRoomEmbed({
  roomName,
  displayName,
  onClose,
}: {
  roomName: string;
  displayName?: string;
  onClose?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <JitsiMeeting
        roomName={roomName}
        userInfo={{ displayName: displayName || "Helm user", email: "" }}
        configOverwrite={{ startWithAudioMuted: true, prejoinPageEnabled: false }}
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
