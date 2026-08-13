"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pollCalls,
  postAnswer,
  postCandidate,
  postEnd,
  postOffer,
  postReject,
} from "@/lib/calls/client";
import { CALL_RING_TIMEOUT_MS } from "@/lib/webrtc/config";
import { useWebRTC } from "@/hooks/useWebRTC";
import type { CallPollEvent, CallRecord, CallType, ConnectionStatus } from "@/types/call";

type UseCallOptions = {
  userId: string | undefined;
  enabled: boolean;
};

function peerLabel(call: CallRecord, userId: string) {
  const peer = call.callerId === userId ? call.callee : call.caller;
  return peer?.name ?? peer?.email ?? "Unknown";
}

const ICE_FAILURE_GRACE_MS = 8_000;

export function useCall({ userId, enabled }: UseCallOptions) {
  const webrtc = useWebRTC();

  const afterRef = useRef(new Date(0).toISOString());
  const activeCallRef = useRef<CallRecord | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const answerAppliedRef = useRef(false);
  const connectionStatusRef = useRef<ConnectionStatus>("idle");
  const incomingCallRef = useRef<CallRecord | null>(null);
  const iceFailureTimerRef = useRef<number | null>(null);
  const pendingOutgoingCandidatesRef = useRef<
    { callId: string; candidate: RTCIceCandidateInit }[]
  >([]);

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const setStatus = useCallback((status: ConnectionStatus) => {
    connectionStatusRef.current = status;
    setConnectionStatus(status);
  }, []);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current !== null) {
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const clearIceFailureTimer = useCallback(() => {
    if (iceFailureTimerRef.current !== null) {
      window.clearTimeout(iceFailureTimerRef.current);
      iceFailureTimerRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    clearRingTimer();
    clearIceFailureTimer();
    activeCallRef.current = null;
    roleRef.current = null;
    answerAppliedRef.current = false;
    pendingOutgoingCandidatesRef.current = [];
    setActiveCall(null);
    setIncomingCall(null);
    incomingCallRef.current = null;
    setStatus("idle");
    setIsBusy(false);
    webrtc.cleanup();
  }, [clearRingTimer, clearIceFailureTimer, setStatus, webrtc.cleanup]);

  const sendCandidate = useCallback(async (callId: string, candidate: RTCIceCandidateInit) => {
    try {
      await postCandidate(callId, candidate);
    } catch {
      // Best-effort
    }
  }, []);

  const flushOutgoingCandidates = useCallback(
    async (callId: string) => {
      const pending = pendingOutgoingCandidatesRef.current.filter(
        (item) => item.callId === callId || item.callId === "",
      );
      pendingOutgoingCandidatesRef.current =
        pendingOutgoingCandidatesRef.current.filter(
          (item) => item.callId !== callId && item.callId !== "",
        );

      for (const item of pending) {
        await sendCandidate(callId, item.candidate);
      }
    },
    [sendCandidate],
  );

  const queueOrSendCandidate = useCallback(
    (callId: string | null, candidate: RTCIceCandidateInit) => {
      if (!callId) {
        pendingOutgoingCandidatesRef.current.push({ callId: "", candidate });
        return;
      }
      void sendCandidate(callId, candidate);
    },
    [sendCandidate],
  );

  const finalizeCall = useCallback(
    async (callId: string | null, notifyRemote = true) => {
      if (
        connectionStatusRef.current === "ended" ||
        connectionStatusRef.current === "idle"
      ) {
        return;
      }

      clearRingTimer();
      clearIceFailureTimer();

      if (notifyRemote && callId) {
        try {
          await postEnd(callId);
        } catch {
          // Remote may already have ended.
        }
      }

      activeCallRef.current = null;
      roleRef.current = null;
      answerAppliedRef.current = false;
      pendingOutgoingCandidatesRef.current = [];
      setActiveCall(null);
      setIncomingCall(null);
      incomingCallRef.current = null;
      setIsBusy(false);
      webrtc.cleanup();

      setStatus("ended");
      window.setTimeout(() => {
        setStatus("idle");
        setCallError(null);
      }, 2000);
    },
    [clearRingTimer, clearIceFailureTimer, setStatus, webrtc.cleanup],
  );

  // Use a ref for finalizeCall so the poll loop doesn't restart when it changes
  const finalizeCallRef = useRef(finalizeCall);
  finalizeCallRef.current = finalizeCall;

  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  // Stable poll event processor using refs
  const processPollEvents = useCallback(
    async (events: CallPollEvent[]) => {
      let maxTimestamp = afterRef.current;

      for (const event of events) {
        if (event.timestamp > maxTimestamp) {
          maxTimestamp = event.timestamp;
        }

        if (event.type === "incoming") {
          if (
            activeCallRef.current ||
            incomingCallRef.current ||
            connectionStatusRef.current === "calling"
          ) {
            continue;
          }
          incomingCallRef.current = event.call;
          setIncomingCall(event.call);
          setStatus("incoming");
          continue;
        }

        if (event.type === "answered" && activeCallRef.current?.id === event.callId) {
          if (answerAppliedRef.current) {
            continue;
          }
          try {
            await webrtcRef.current.applyAnswer(event.answerSdp);
            answerAppliedRef.current = true;
            if (ringTimerRef.current !== null) {
              window.clearTimeout(ringTimerRef.current);
              ringTimerRef.current = null;
            }
            setStatus("connecting");
          } catch {
            setCallError("Failed to connect the call");
            void finalizeCallRef.current(event.callId, true);
          }
          continue;
        }

        if (
          event.type === "candidate" &&
          activeCallRef.current?.id === event.callId
        ) {
          await webrtcRef.current.addRemoteCandidate(event.candidate);
          continue;
        }

        if (event.type === "rejected" && activeCallRef.current?.id === event.callId) {
          setCallError("Call was rejected");
          void finalizeCallRef.current(null, false);
          continue;
        }

        if (event.type === "busy" && activeCallRef.current?.id === event.callId) {
          setCallError("User is busy");
          void finalizeCallRef.current(null, false);
          continue;
        }

        if (event.type === "missed") {
          if (
            activeCallRef.current?.id === event.callId ||
            incomingCallRef.current?.id === event.callId
          ) {
            setCallError("Call timed out");
            void finalizeCallRef.current(null, false);
          }
          continue;
        }

        if (event.type === "ended") {
          if (
            activeCallRef.current?.id === event.callId ||
            incomingCallRef.current?.id === event.callId
          ) {
            if (
              connectionStatusRef.current !== "ended" &&
              connectionStatusRef.current !== "idle"
            ) {
              void finalizeCallRef.current(null, false);
            }
          }
          continue;
        }
      }

      afterRef.current = maxTimestamp;
    },
    // Only depends on setStatus which is stable
    [setStatus],
  );

  // Poll loop - stable dependencies so it doesn't restart on every render
  useEffect(() => {
    if (!enabled || !userId) return;

    const abortController = new AbortController();
    let active = true;

    async function pollLoop() {
      while (active && !abortController.signal.aborted) {
        try {
          const events = await pollCalls(afterRef.current, {
            wait: true,
            callId: activeCallRef.current?.id,
            signal: abortController.signal,
          });

          if (events.length > 0) {
            await processPollEvents(events);
          }
        } catch (error) {
          if (abortController.signal.aborted) break;
          const isAbort =
            error instanceof DOMException && error.name === "AbortError";
          if (isAbort) break;
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
      }
    }

    void pollLoop();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [enabled, userId, processPollEvents]);

  // Monitor WebRTC connection. Do not hang up on "disconnected" — that is
  // a normal ICE blip. Only end after a real "failed" state lasts a while.
  useEffect(() => {
    const status = connectionStatusRef.current;
    if (
      status === "idle" ||
      status === "incoming" ||
      status === "ended" ||
      status === "calling"
    ) {
      return;
    }

    const { peerConnectionState, iceConnectionState } = webrtc;
    const isUp =
      peerConnectionState === "connected" &&
      (iceConnectionState === "connected" || iceConnectionState === "completed");
    const isFailed =
      iceConnectionState === "failed" || peerConnectionState === "failed";

    if (isUp) {
      clearIceFailureTimer();
      if (status !== "connected") {
        setStatus("connected");
      }
      return;
    }

    if (isFailed) {
      if (iceFailureTimerRef.current === null) {
        iceFailureTimerRef.current = window.setTimeout(() => {
          iceFailureTimerRef.current = null;
          const stillFailed =
            webrtcRef.current.iceConnectionState === "failed" ||
            webrtcRef.current.peerConnectionState === "failed";
          if (
            stillFailed &&
            connectionStatusRef.current !== "ended" &&
            connectionStatusRef.current !== "idle"
          ) {
            setCallError("Connection failed");
            void finalizeCallRef.current(activeCallRef.current?.id ?? null, true);
          }
        }, ICE_FAILURE_GRACE_MS);
      }
      if (status !== "reconnecting") {
        setStatus("reconnecting");
      }
      return;
    }

    clearIceFailureTimer();

    if (
      iceConnectionState === "disconnected" ||
      peerConnectionState === "disconnected"
    ) {
      if (status !== "reconnecting") {
        setStatus("reconnecting");
      }
      return;
    }

    if (status !== "connecting") {
      setStatus("connecting");
    }
  }, [
    webrtc.peerConnectionState,
    webrtc.iceConnectionState,
    setStatus,
    clearIceFailureTimer,
  ]);

  const startCall = useCallback(
    async (toUserId: string, type: CallType) => {
      if (!userId || isBusy || activeCallRef.current || incomingCallRef.current) return;

      setCallError(null);
      setIsBusy(true);
      setStatus("calling");

      try {
        await webrtc.acquireMedia(type);
        const sdp = await webrtc.createOffer((candidate) => {
          queueOrSendCandidate(activeCallRef.current?.id ?? null, candidate);
        });

        const call = await postOffer(toUserId, type, sdp);
        activeCallRef.current = call;
        roleRef.current = "caller";
        setActiveCall(call);
        await flushOutgoingCandidates(call.id);

        ringTimerRef.current = window.setTimeout(() => {
          if (
            activeCallRef.current?.id === call.id &&
            connectionStatusRef.current === "calling"
          ) {
            setCallError("No answer");
            void finalizeCallRef.current(call.id, true);
          }
        }, CALL_RING_TIMEOUT_MS);
      } catch (error) {
        setCallError(
          error instanceof Error ? error.message : "Could not start call",
        );
        resetCallState();
      } finally {
        setIsBusy(false);
      }
    },
    [
      flushOutgoingCandidates,
      isBusy,
      queueOrSendCandidate,
      resetCallState,
      setStatus,
      userId,
      webrtc.acquireMedia,
      webrtc.createOffer,
    ],
  );

  const acceptCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming?.offerSdp || !userId) return;

    setCallError(null);
    setIsBusy(true);
    clearRingTimer();

    try {
      await webrtc.acquireMedia(incoming.type);
      const sdp = await webrtc.createAnswer(incoming.offerSdp, (candidate) => {
        queueOrSendCandidate(incoming.id, candidate);
      });

      await flushOutgoingCandidates(incoming.id);
      const call = await postAnswer(incoming.id, sdp);
      activeCallRef.current = call;
      roleRef.current = "callee";
      setActiveCall(call);
      setIncomingCall(null);
      incomingCallRef.current = null;
      setStatus("connecting");
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Could not accept call",
      );
      try {
        await postReject(incoming.id);
      } catch {
        // Ignore
      }
      resetCallState();
    } finally {
      setIsBusy(false);
    }
  }, [
    clearRingTimer,
    flushOutgoingCandidates,
    queueOrSendCandidate,
    resetCallState,
    setStatus,
    userId,
    webrtc.acquireMedia,
    webrtc.createAnswer,
  ]);

  const rejectCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;

    setIsBusy(true);
    try {
      await postReject(incoming.id);
    } catch {
      setCallError("Failed to reject call");
    } finally {
      resetCallState();
      setIsBusy(false);
    }
  }, [resetCallState]);

  const endCall = useCallback(async () => {
    const callId = activeCallRef.current?.id ?? incomingCallRef.current?.id ?? null;
    await finalizeCall(callId, true);
  }, [finalizeCall]);

  const activePeerName = activeCall
    ? peerLabel(activeCall, userId ?? "")
    : incomingCall
      ? peerLabel(incomingCall, userId ?? "")
      : null;

  return {
    connectionStatus,
    incomingCall,
    activeCall,
    activePeerName,
    callError: callError ?? webrtc.mediaError,
    isBusy,
    localStream: webrtc.localStream,
    remoteStream: webrtc.remoteStream,
    isMuted: webrtc.isMuted,
    isCameraOff: webrtc.isCameraOff,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute: webrtc.toggleMute,
    toggleCamera: webrtc.toggleCamera,
  };
}
