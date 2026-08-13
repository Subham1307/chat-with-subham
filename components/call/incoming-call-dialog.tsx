"use client";

import type { CallRecord } from "@/types/call";

type IncomingCallDialogProps = {
  call: CallRecord;
  peerName: string;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export function IncomingCallDialog({
  call,
  peerName,
  busy,
  onAccept,
  onReject,
}: IncomingCallDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-center text-sm font-medium uppercase tracking-wide text-rose-500">
          Incoming {call.type} call
        </p>
        <h2 className="mt-2 text-center text-2xl font-semibold text-zinc-900">
          {peerName}
        </h2>
        <p className="mt-1 text-center text-sm text-zinc-500">
          {call.type === "video" ? "📹 Video call" : "📞 Audio call"}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
