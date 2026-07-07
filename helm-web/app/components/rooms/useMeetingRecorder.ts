"use client";

import { useCallback, useRef, useState } from "react";

export type RecordMode = "mic" | "full";

/**
 * Records a live meeting from the host's browser without any server-side
 * recorder (Jibri).
 *
 *  - "mic":  microphone only. Can start hands-free (getUserMedia needs a
 *            permission grant but no click/picker), so it auto-records.
 *  - "full": the Jitsi tab's audio (every remote participant) via
 *            getDisplayMedia, mixed with the mic. Captures everyone, but the
 *            browser REQUIRES a user gesture + a "share tab" picker, so it can
 *            only be triggered from a click.
 *
 * On `stop()` it returns a single audio Blob ready to POST to the pipeline.
 */
export function useMeetingRecorder() {
  const [recording, setRecording] = useState(false);
  const [mode, setMode] = useState<RecordMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Epoch ms when the current recording actually started — lets callers
  // timestamp live events (e.g. Jitsi's dominantSpeakerChanged) on the same
  // clock as the recorded audio, so they line up with Whisper's segment
  // timestamps after the fact.
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    recorderRef.current = null;
  }, []);

  const stopInternal = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        cleanup();
        setRecording(false);
        setMode(null);
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: "audio/webm" })
          : null;
        cleanup();
        setRecording(false);
        setMode(null);
        setStartedAt(null);
        resolve(blob && blob.size ? blob : null);
      };
      rec.stop();
    });
  }, [cleanup]);

  const start = useCallback(
    async (requested: RecordMode = "full") => {
      setError(null);
      // Restarting (e.g. upgrading mic → full): drop the in-progress recorder.
      if (recorderRef.current) await stopInternal();
      try {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const streams: MediaStream[] = [];

        if (requested === "full") {
          // Prompt the host to share the meeting tab *with audio*.
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          streams.push(display);
          const tabAudio = display.getAudioTracks();
          if (tabAudio.length) ctx.createMediaStreamSource(new MediaStream(tabAudio)).connect(dest);
        }

        // Mic — captures the host's own voice (and works hands-free for "mic").
        let mic: MediaStream | null = null;
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          /* mic optional in full mode; required in mic mode (handled below) */
        }
        if (mic?.getAudioTracks().length) {
          streams.push(mic);
          ctx.createMediaStreamSource(mic).connect(dest);
        }

        if (!dest.stream.getAudioTracks().length) {
          streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
          await ctx.close().catch(() => {});
          throw new Error(
            requested === "full"
              ? "No audio captured. When sharing, pick the meeting tab and tick “Share tab audio”."
              : "Microphone unavailable — allow mic access to record."
          );
        }

        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const rec = new MediaRecorder(dest.stream, { mimeType: mime });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.start(1000);

        recorderRef.current = rec;
        streamsRef.current = streams;
        ctxRef.current = ctx;
        setMode(requested);
        setRecording(true);
        setStartedAt(Date.now());
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not start recording";
        setError(msg);
        throw e;
      }
    },
    [stopInternal]
  );

  return { recording, mode, error, startedAt, start, stop: stopInternal };
}
