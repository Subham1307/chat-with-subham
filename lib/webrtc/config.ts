export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const CALL_RING_TIMEOUT_MS = 45_000;

/** Keep well under Vercel Hobby's ~10s function limit. */
export const CALL_POLL_TIMEOUT_MS = 4_000;
