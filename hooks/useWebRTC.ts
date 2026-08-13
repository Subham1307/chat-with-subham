"use client";

import { useCallback, useRef, useState } from "react";
import { ICE_SERVERS } from "@/lib/webrtc/config";
import { mediaErrorMessage } from "@/lib/calls/client";
import type { CallType } from "@/types/call";

type IceCandidateHandler = (candidate: RTCIceCandidateInit) => void;

export function useWebRTC() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerConnectionState, setPeerConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const [iceConnectionState, setIceConnectionState] =
    useState<RTCIceConnectionState>("new");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const closePeerConnection = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    setRemoteStream(null);
    setPeerConnectionState("closed");
    setIceConnectionState("closed");
  }, []);

  const cleanup = useCallback(() => {
    stopLocalStream();
    closePeerConnection();
    setIsMuted(false);
    setIsCameraOff(false);
    setMediaError(null);
  }, [closePeerConnection, stopLocalStream]);

  const acquireMedia = useCallback(async (type: CallType) => {
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOff(type === "audio");
      return stream;
    } catch (error) {
      const message = mediaErrorMessage(error);
      setMediaError(message);
      throw new Error(message);
    }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescriptionSetRef.current) return;

    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore stale candidates after reconnect attempts.
      }
    }
  }, []);

  const addRemoteCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      if (!pc) return;

      if (!remoteDescriptionSetRef.current || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore duplicate or late candidates.
      }
    },
    [],
  );

  const initPeerConnection = useCallback(
    (onIceCandidate: IceCandidateHandler) => {
      closePeerConnection();

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          onIceCandidate(event.candidate.toJSON());
        }
      };

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          if (!remote.getTracks().some((existing) => existing.id === track.id)) {
            remote.addTrack(track);
          }
        });
        setRemoteStream(new MediaStream(remote.getTracks()));
      };

      pc.onconnectionstatechange = () => {
        setPeerConnectionState(pc.connectionState);
      };

      pc.oniceconnectionstatechange = () => {
        setIceConnectionState(pc.iceConnectionState);
      };

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      return pc;
    },
    [closePeerConnection],
  );

  const createOffer = useCallback(async (onIceCandidate: IceCandidateHandler) => {
    const pc = initPeerConnection(onIceCandidate);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer.sdp ?? "";
  }, [initPeerConnection]);

  const createAnswer = useCallback(
    async (offerSdp: string, onIceCandidate: IceCandidateHandler) => {
      const pc = initPeerConnection(onIceCandidate);
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: offerSdp }),
      );
      remoteDescriptionSetRef.current = true;
      await flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer.sdp ?? "";
    },
    [flushPendingCandidates, initPeerConnection],
  );

  const applyAnswer = useCallback(
    async (answerSdp: string) => {
      const pc = pcRef.current;
      if (!pc) return;

      if (pc.remoteDescription?.type === "answer") {
        return;
      }

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: answerSdp }),
      );
      remoteDescriptionSetRef.current = true;
      await flushPendingCandidates();
    },
    [flushPendingCandidates],
  );

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current
      ?.getAudioTracks()
      .find((track) => track.kind === "audio");

    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current
      ?.getVideoTracks()
      .find((track) => track.kind === "video");

    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraOff(!videoTrack.enabled);
  }, []);

  return {
    localStream,
    remoteStream,
    peerConnectionState,
    iceConnectionState,
    isMuted,
    isCameraOff,
    mediaError,
    acquireMedia,
    createOffer,
    createAnswer,
    applyAnswer,
    addRemoteCandidate,
    toggleMute,
    toggleCamera,
    cleanup,
  };
}
