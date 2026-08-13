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
import type { CallRecord, CallType, ConnectionStatus } from "@/types/call";

type UseCallOptions = {
  userId: string | undefined;
  enabled: boolean;
};

function peerLabel(call: CallRecord, userId: string) {
  const peer = call.callerId === userId ? call.callee : call.caller;
  return peer?.name ?? peer?.email ?? "Unknown";
}

function mapConnectionStatus(
  uiStatus: ConnectionStatus,
  peerState: RTCPeerConnectionState,
  iceState: RTCIceConnectionState,
): ConnectionStatus {
  if (uiStatus === "incoming" || uiStatus === "calling") {
    return uiStatus;
  }

  if (peerState === "connected" && (iceState === "connected" || iceState === "completed")) {
    return "connected";
  }

  if (iceState === "failed" || peerState === "failed") {
    return "failed";
  }

  if (iceState === "disconnected" || peerState === "disconnected") {
    return "reconnecting";
  }

  if (uiStatus === "connecting" || peerState === "connecting" || iceState === "checking") {
    return "connecting";
  }

  return uiStatus;
}

export function useCall({ userId, enabled }: UseCallOptions) {
  const webrtc = useWebRTC();
  const afterRef = useRef(new Date(0).toISOString());
  const activeCallRef = useRef<CallRecord | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const answerAppliedRef = useRef(false);
  const connectionStatusRef = useRef<ConnectionStatus>("idle");
  const incomingCallRef = useRef<CallRecord | null>(null);
  const pendingOutgoingCandidatesRef = useRef<
    { callId: string; candidate: RTCIceCandidateInit }[]
  >([]);

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current !== null) {
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    clearRingTimer();
    activeCallRef.current = null;
    roleRef.current = null;
    answerAppliedRef.current = false;
    pendingOutgoingCandidatesRef.current = [];
    setActiveCall(null);
    setIncomingCall(null);
    setConnectionStatus("idle");
    setIsBusy(false);
    webrtc.cleanup();
  }, [clearRingTimer, webrtc]);

  const sendCandidate = useCallback(async (callId: string, candidate: RTCIceCandidateInit) => {
    try {
      await postCandidate(callId, candidate);
    } catch {
      // Candidate exchange is best-effort during negotiation.
    }
  }, []);

  const flushOutgoingCandidates = useCallback(
    async (callId: string) => {
      const pending = pendingOutgoingCandidatesRef.current.filter(
        (item) => item.callId === callId,
      );
      pendingOutgoingCandidatesRef.current =
        pendingOutgoingCandidatesRef.current.filter((item) => item.callId !== callId);

      for (const item of pending) {
        await sendCandidate(item.callId, item.candidate);
      }
    },
    [sendCandidate],
  );

  const queueOrSendCandidate = useCallback(
    (callId: string | null, candidate: RTCIceCandidateInit) => {
      if (!callId) {
        pendingOutgoingCandidatesRef.current.push({
          callId: "",
          candidate,
        });
        return;
      }

      const queued = pendingOutgoingCandidatesRef.current.filter(
        (item) => item.callId === "",
      );
      pendingOutgoingCandidatesRef.current =
        pendingOutgoingCandidatesRef.current.filter((item) => item.callId !== "");

      for (const item of queued) {
        void sendCandidate(callId, item.candidate);
      }

      void sendCandidate(callId, candidate);
    },
    [sendCandidate],
  );

  const finalizeCall = useCallback(
    async (callId: string | null, notifyRemote = true) => {
      clearRingTimer();
      if (notifyRemote && callId) {
        try {
          await postEnd(callId);
        } catch {
          // Remote may already have ended the call.
        }
      }
      resetCallState();
      setConnectionStatus("ended");
      window.setTimeout(() => {
        setConnectionStatus("idle");
        setCallError(null);
      }, 1500);
    },
    [clearRingTimer, resetCallState],
  );

  const handleRemoteEnded = useCallback(
    (callId: string) => {
      if (
        activeCallRef.current?.id !== callId &&
        incomingCallRef.current?.id !== callId
      ) {
        return;
      }
      void finalizeCall(null, false);
    },
    [finalizeCall],
  );

  const processPollEvents = useCallback(
    async (events: Awaited<ReturnType<typeof pollCalls>>) => {
      for (const event of events) {
        afterRef.current = new Date().toISOString();

        if (event.type === "incoming") {
          if (
            activeCallRef.current ||
            incomingCallRef.current ||
            connectionStatusRef.current === "calling"
          ) {
            continue;
          }
          setIncomingCall(event.call);
          setConnectionStatus("incoming");
          continue;
        }

        if (event.type === "answered" && activeCallRef.current?.id === event.callId) {
          if (answerAppliedRef.current) {
            continue;
          }
          try {
            await webrtc.applyAnswer(event.answerSdp);
            answerAppliedRef.current = true;
            setConnectionStatus("connecting");
          } catch {
            setCallError("Failed to connect the call");
            void finalizeCall(event.callId);
          }
          continue;
        }

        if (
          event.type === "candidate" &&
          activeCallRef.current?.id === event.callId
        ) {
          await webrtc.addRemoteCandidate(event.candidate);
          continue;
        }

        if (event.type === "rejected" && activeCallRef.current?.id === event.callId) {
          setCallError("Call was rejected");
          void finalizeCall(null, false);
          continue;
        }

        if (event.type === "busy" && activeCallRef.current?.id === event.callId) {
          setCallError("User is busy");
          void finalizeCall(null, false);
          continue;
        }

        if (event.type === "missed") {
          if (
            activeCallRef.current?.id === event.callId ||
            incomingCallRef.current?.id === event.callId
          ) {
            setCallError("Call timed out");
            void finalizeCall(null, false);
          }
          continue;
        }

        if (event.type === "ended") {
          handleRemoteEnded(event.callId);
        }
      }
    },
    [finalizeCall, handleRemoteEnded, webrtc],
  );

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
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
    }

    void pollLoop();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [enabled, processPollEvents, userId]);

  useEffect(() => {
    if (connectionStatus === "idle" || connectionStatus === "incoming") {
      return;
    }

    const next = mapConnectionStatus(
      connectionStatus,
      webrtc.peerConnectionState,
      webrtc.iceConnectionState,
    );

    if (next !== connectionStatus) {
      setConnectionStatus(next);
    }

    if (next === "failed") {
      setCallError("Connection failed");
      void finalizeCall(activeCallRef.current?.id ?? null);
    }
  }, [
    connectionStatus,
    finalizeCall,
    webrtc.iceConnectionState,
    webrtc.peerConnectionState,
  ]);

  const startCall = useCallback(
    async (toUserId: string, type: CallType) => {
      if (!userId || isBusy || activeCallRef.current || incomingCall) return;

      setCallError(null);
      setIsBusy(true);
      setConnectionStatus("calling");

      try {
        await webrtc.acquireMedia(type);
        const sdp = await webrtc.createOffer((candidate) => {
          queueOrSendCandidate(activeCallRef.current?.id ?? null, candidate);
        });

        const call = await postOffer(toUserId, type, sdp);
        activeCallRef.current = call;
        roleRef.current = "caller";
        setActiveCall(call);
        setConnectionStatus("calling");
        await flushOutgoingCandidates(call.id);

        ringTimerRef.current = window.setTimeout(() => {
          if (activeCallRef.current?.id === call.id) {
            setCallError("No answer");
            void finalizeCall(call.id);
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
      finalizeCall,
      incomingCall,
      isBusy,
      resetCallState,
      flushOutgoingCandidates,
      queueOrSendCandidate,
      userId,
      webrtc,
    ],
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall?.offerSdp || !userId) return;

    setCallError(null);
    setIsBusy(true);
    clearRingTimer();

    try {
      await webrtc.acquireMedia(incomingCall.type);
      const sdp = await webrtc.createAnswer(incomingCall.offerSdp, (candidate) => {
        queueOrSendCandidate(incomingCall.id, candidate);
      });

      const call = await postAnswer(incomingCall.id, sdp);
      activeCallRef.current = call;
      roleRef.current = "callee";
      setActiveCall(call);
      setIncomingCall(null);
      setConnectionStatus("connecting");
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Could not accept call",
      );
      try {
        await postReject(incomingCall.id);
      } catch {
        // Ignore reject failures during error recovery.
      }
      resetCallState();
    } finally {
      setIsBusy(false);
    }
  }, [
    clearRingTimer,
    incomingCall,
    resetCallState,
    queueOrSendCandidate,
    userId,
    webrtc,
  ]);

  const rejectCall = useCallback(async () => {
    if (!incomingCall) return;

    setIsBusy(true);
    try {
      await postReject(incomingCall.id);
    } catch {
      setCallError("Failed to reject call");
    } finally {
      resetCallState();
      setIsBusy(false);
    }
  }, [incomingCall, resetCallState]);

  const endCall = useCallback(async () => {
    const callId = activeCallRef.current?.id ?? incomingCall?.id ?? null;
    await finalizeCall(callId);
  }, [finalizeCall, incomingCall?.id]);

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
