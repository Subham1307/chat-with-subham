export type CallType = "audio" | "video";

export type CallStatus =
  | "ringing"
  | "connecting"
  | "rejected"
  | "ended"
  | "missed"
  | "busy";

export type CallPeer = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export type CallRecord = {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallStatus;
  offerSdp: string | null;
  answerSdp: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  caller?: CallPeer;
  callee?: CallPeer;
};

export type CallHistoryStatus = Extract<
  CallStatus,
  "ended" | "rejected" | "missed" | "busy"
>;

export type CallHistoryItem = {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallHistoryStatus;
  createdAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  caller: CallPeer;
  callee: CallPeer;
};

export type CallPollEvent = {
  timestamp: string;
} & (
  | {
      type: "incoming";
      call: CallRecord;
    }
  | {
      type: "answered";
      callId: string;
      answerSdp: string;
    }
  | {
      type: "rejected";
      callId: string;
    }
  | {
      type: "ended";
      callId: string;
    }
  | {
      type: "missed";
      callId: string;
    }
  | {
      type: "busy";
      callId: string;
    }
  | {
      type: "candidate";
      callId: string;
      fromUserId: string;
      candidate: RTCIceCandidateInit;
    }
);

export type ConnectionStatus =
  | "idle"
  | "calling"
  | "incoming"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "ended";
