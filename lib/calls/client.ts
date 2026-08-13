import type { CallHistoryItem, CallPollEvent, CallRecord, CallType } from "@/types/call";

async function parseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return data?.error ?? fallback;
}

export async function postOffer(
  toUserId: string,
  type: CallType,
  sdp: string,
): Promise<CallRecord> {
  const response = await fetch("/api/calls/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toUserId, type, sdp }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to start call"));
  }

  return response.json();
}

export async function postAnswer(callId: string, sdp: string) {
  const response = await fetch("/api/calls/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, sdp }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to accept call"));
  }

  return response.json() as Promise<CallRecord>;
}

export async function postCandidate(
  callId: string,
  candidate: RTCIceCandidateInit,
) {
  const response = await fetch("/api/calls/candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, candidate }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to send ICE candidate"));
  }
}

export async function postReject(callId: string) {
  const response = await fetch("/api/calls/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to reject call"));
  }
}

export async function postEnd(callId: string) {
  const response = await fetch("/api/calls/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to end call"));
  }
}

export async function fetchCallHistory(
  withUserId: string,
  options?: { after?: string; signal?: AbortSignal },
) {
  const params = new URLSearchParams({ withUserId });
  if (options?.after) params.set("after", options.after);

  const response = await fetch(`/api/calls/history?${params}`, {
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to load call history"));
  }

  return response.json() as Promise<CallHistoryItem[]>;
}

export async function pollCalls(
  after: string,
  options?: { wait?: boolean; callId?: string; signal?: AbortSignal },
): Promise<CallPollEvent[]> {
  const params = new URLSearchParams({ after });
  if (options?.wait) params.set("wait", "true");
  if (options?.callId) params.set("callId", options.callId);

  const response = await fetch(`/api/calls/poll?${params}`, {
    signal: options?.signal,
  });

  if (options?.signal?.aborted) {
    return [];
  }

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to poll calls"));
  }

  const data: { events: CallPollEvent[] } = await response.json();
  return data.events;
}

export function mediaErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : "Could not access media devices";
  }

  if (
    error.name === "NotAllowedError" ||
    error.name === "PermissionDeniedError"
  ) {
    return "Camera or microphone permission was denied";
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No camera or microphone found";
  }

  if (error.name === "NotReadableError") {
    return "Camera or microphone is already in use";
  }

  return error.message || "Could not access media devices";
}
