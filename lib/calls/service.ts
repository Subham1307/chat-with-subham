import { prisma } from "@/lib/prisma";
import { CALL_RING_TIMEOUT_MS } from "@/lib/webrtc/config";
import type {
  CallHistoryItem,
  CallHistoryStatus,
  CallPollEvent,
  CallRecord,
  CallType,
} from "@/types/call";

const ACTIVE_STATUSES = ["ringing", "connecting"] as const;

const callInclude = {
  caller: {
    select: { id: true, name: true, email: true, role: true },
  },
  callee: {
    select: { id: true, name: true, email: true, role: true },
  },
} as const;

export function serializeCall(call: {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: string;
  offerSdp: string | null;
  answerSdp: string | null;
  connectedAt?: Date | null;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  caller?: { id: string; name: string | null; email: string; role: string };
  callee?: { id: string; name: string | null; email: string; role: string };
}): CallRecord {
  return {
    id: call.id,
    callerId: call.callerId,
    calleeId: call.calleeId,
    type: call.type,
    status: call.status as CallRecord["status"],
    offerSdp: call.offerSdp,
    answerSdp: call.answerSdp,
    connectedAt: call.connectedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
    caller: call.caller,
    callee: call.callee,
  };
}

function durationSeconds(
  connectedAt: Date | null,
  endedAt: Date | null,
): number | null {
  if (!connectedAt || !endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - connectedAt.getTime()) / 1000));
}

export function serializeCallHistory(call: {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallHistoryStatus;
  connectedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  caller: { id: string; name: string | null; email: string; role: string };
  callee: { id: string; name: string | null; email: string; role: string };
}): CallHistoryItem {
  return {
    id: call.id,
    callerId: call.callerId,
    calleeId: call.calleeId,
    type: call.type,
    status: call.status,
    createdAt: call.createdAt.toISOString(),
    connectedAt: call.connectedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: durationSeconds(call.connectedAt, call.endedAt),
    caller: call.caller,
    callee: call.callee,
  };
}

export async function expireStaleCalls() {
  const cutoff = new Date(Date.now() - CALL_RING_TIMEOUT_MS);
  const stale = await prisma.call.findMany({
    where: {
      status: "ringing",
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  });

  for (const call of stale) {
    await cleanupCall(call.id, "missed");
  }

  return stale.length;
}

export async function getActiveCallForUser(userId: string) {
  return prisma.call.findFirst({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      OR: [{ callerId: userId }, { calleeId: userId }],
    },
    include: callInclude,
  });
}

export async function cleanupCall(
  callId: string,
  status: "ended" | "rejected" | "missed" | "busy" = "ended",
) {
  await prisma.callIceCandidate.deleteMany({ where: { callId } });
  await prisma.call.update({
    where: { id: callId },
    data: {
      status,
      offerSdp: null,
      answerSdp: null,
      endedAt: new Date(),
    },
  });
}

const HISTORY_STATUSES: CallHistoryStatus[] = [
  "ended",
  "rejected",
  "missed",
  "busy",
];

export async function getConversationCalls(
  userId: string,
  withUserId: string,
  after?: Date | null,
) {
  const calls = await prisma.call.findMany({
    where: {
      status: { in: HISTORY_STATUSES },
      OR: [
        { callerId: userId, calleeId: withUserId },
        { callerId: withUserId, calleeId: userId },
      ],
      ...(after ? { endedAt: { gt: after } } : {}),
    },
    include: callInclude,
    orderBy: { createdAt: "asc" },
  });

  return calls.map((call) =>
    serializeCallHistory({
      ...call,
      status: call.status as CallHistoryStatus,
    }),
  );
}

export async function getCallForParticipant(callId: string, userId: string) {
  return prisma.call.findFirst({
    where: {
      id: callId,
      OR: [{ callerId: userId }, { calleeId: userId }],
    },
    include: callInclude,
  });
}

export async function collectPollEvents(
  userId: string,
  after: Date,
  activeCallId?: string | null,
): Promise<CallPollEvent[]> {
  await expireStaleCalls();

  const events: CallPollEvent[] = [];

  const incoming = await prisma.call.findMany({
    where: {
      calleeId: userId,
      status: "ringing",
      updatedAt: { gt: after },
    },
    include: callInclude,
    orderBy: { updatedAt: "asc" },
  });

  for (const call of incoming) {
    events.push({
      timestamp: call.updatedAt.toISOString(),
      type: "incoming",
      call: serializeCall(call),
    });
  }

  const updatedCalls = await prisma.call.findMany({
    where: {
      OR: [{ callerId: userId }, { calleeId: userId }],
      updatedAt: { gt: after },
      status: { in: ["connecting", "rejected", "ended", "missed", "busy"] },
      ...(activeCallId ? { id: activeCallId } : {}),
    },
    orderBy: { updatedAt: "asc" },
  });

  for (const call of updatedCalls) {
    const timestamp = call.updatedAt.toISOString();
    if (call.status === "connecting" && call.answerSdp && call.callerId === userId) {
      events.push({
        timestamp,
        type: "answered",
        callId: call.id,
        answerSdp: call.answerSdp,
      });
    } else if (call.status === "rejected") {
      events.push({ timestamp, type: "rejected", callId: call.id });
    } else if (call.status === "ended") {
      events.push({ timestamp, type: "ended", callId: call.id });
    } else if (call.status === "missed") {
      events.push({ timestamp, type: "missed", callId: call.id });
    } else if (call.status === "busy") {
      events.push({ timestamp, type: "busy", callId: call.id });
    }
  }

  const callIds = activeCallId
    ? [activeCallId]
    : (
        await prisma.call.findMany({
          where: {
            OR: [{ callerId: userId }, { calleeId: userId }],
            status: { in: [...ACTIVE_STATUSES] },
          },
          select: { id: true },
        })
      ).map((call) => call.id);

  if (callIds.length > 0) {
    const candidates = await prisma.callIceCandidate.findMany({
      where: {
        callId: { in: callIds },
        fromUserId: { not: userId },
        createdAt: { gt: after },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const item of candidates) {
      events.push({
        timestamp: item.createdAt.toISOString(),
        type: "candidate",
        callId: item.callId,
        fromUserId: item.fromUserId,
        candidate: JSON.parse(item.candidate) as RTCIceCandidateInit,
      });
    }
  }

  return events;
}

export async function waitForPollEvents(
  userId: string,
  after: Date,
  activeCallId?: string | null,
  timeoutMs = 4_000,
  intervalMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const events = await collectPollEvents(userId, after, activeCallId);
    if (events.length > 0) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return [] as CallPollEvent[];
}
