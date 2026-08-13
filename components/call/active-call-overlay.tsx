"use client";

import { useEffect, useRef } from "react";
import type { CallType, ConnectionStatus } from "@/types/call";

type ActiveCallOverlayProps = {
  peerName: string;
  callType: CallType;
  connectionStatus: ConnectionStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  busy?: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: "Idle",
  calling: "Calling…",
  incoming: "Incoming…",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  failed: "Connection failed",
  ended: "Call ended",
};

function VideoTile({
  stream,
  label,
  mirrored,
  placeholder,
}: {
  stream: MediaStream | null;
  label: string;
  mirrored?: boolean;
  placeholder: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    void video.play().catch(() => {
      // Autoplay may be blocked until user interaction.
    });
  }, [stream]);

  const hasVideo = stream?.getVideoTracks().some((track) => track.enabled);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-900">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={mirrored}
          className={`h-full w-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-zinc-400">
          {placeholder}
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
        {label}
      </span>
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.srcObject = stream;
    void audio.play().catch(() => {
      // Autoplay may be blocked until user interaction.
    });
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}

export function ActiveCallOverlay({
  peerName,
  callType,
  connectionStatus,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  busy,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: ActiveCallOverlayProps) {
  const isVideoCall = callType === "video";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 p-4 text-white sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">{peerName}</p>
          <p className="text-sm text-zinc-300">
            {STATUS_LABELS[connectionStatus]}
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide">
          {isVideoCall ? "Video" : "Audio"}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
        {isVideoCall ? (
          <div className="grid w-full max-w-4xl gap-4 md:grid-cols-2">
            <VideoTile
              stream={remoteStream}
              label={peerName}
              placeholder="Waiting for remote video…"
            />
            <VideoTile
              stream={localStream}
              label="You"
              mirrored
              placeholder={isCameraOff ? "Camera off" : "Starting camera…"}
            />
          </div>
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-full bg-zinc-800 text-5xl">
            📞
          </div>
        )}
        <RemoteAudio stream={remoteStream} />
      </div>

      <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
            isMuted ? "bg-amber-500 text-zinc-950" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        {isVideoCall ? (
          <button
            type="button"
            onClick={onToggleCamera}
            className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
              isCameraOff
                ? "bg-amber-500 text-zinc-950"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {isCameraOff ? "Camera on" : "Camera off"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onEndCall}
          disabled={busy}
          className="rounded-2xl bg-red-500 px-5 py-3 text-sm font-medium transition hover:bg-red-600 disabled:opacity-50"
        >
          End call
        </button>
      </div>
    </div>
  );
}
