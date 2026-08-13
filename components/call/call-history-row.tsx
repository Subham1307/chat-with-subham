"use client";

import type { CallHistoryItem } from "@/types/call";

function peerName(item: CallHistoryItem, userId: string) {
  const peer = item.callerId === userId ? item.callee : item.caller;
  return peer.name ?? peer.email;
}

function formatDuration(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function callCopy(item: CallHistoryItem, currentUserId: string) {
  const name = peerName(item, currentUserId);
  const iCalled = item.callerId === currentUserId;
  const kind = item.type === "video" ? "video" : "audio";

  if (item.status === "ended") {
    const duration =
      item.durationSeconds !== null
        ? formatDuration(item.durationSeconds)
        : null;
    return duration
      ? `${kind === "video" ? "📹" : "📞"} ${kind === "video" ? "Video" : "Audio"} call · ${duration}`
      : `${kind === "video" ? "📹" : "📞"} ${kind === "video" ? "Video" : "Audio"} call`;
  }

  if (item.status === "missed") {
    return iCalled
      ? `${name} missed your ${kind} call`
      : `You missed a ${kind} call from ${name}`;
  }

  // rejected or busy
  return iCalled
    ? `You tried calling ${name}`
    : `${name} tried calling you`;
}

export function CallHistoryRow({
  item,
  currentUserId,
}: {
  item: CallHistoryItem;
  currentUserId: string;
}) {
  return (
    <div className="flex justify-center py-1">
      <div className="max-w-[90%] rounded-full bg-zinc-100 px-3 py-1.5 text-center text-xs text-zinc-500">
        <p>{callCopy(item, currentUserId)}</p>
        <p className="mt-0.5 text-[10px] text-zinc-400">
          {new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(item.createdAt))}
        </p>
      </div>
    </div>
  );
}
