"use client";

import type { CallType } from "@/types/call";

type CallButtonsProps = {
  disabled?: boolean;
  onStartCall: (type: CallType) => void;
};

export function CallButtons({ disabled, onStartCall }: CallButtonsProps) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStartCall("audio")}
        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        title="Audio call"
      >
        📞 Audio
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStartCall("video")}
        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        title="Video call"
      >
        📹 Video
      </button>
    </div>
  );
}
