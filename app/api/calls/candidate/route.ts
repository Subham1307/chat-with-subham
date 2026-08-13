import { NextResponse } from "next/server";
import { getCallForParticipant } from "@/lib/calls/service";
import { requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

  let body: { callId?: string; candidate?: RTCIceCandidateInit };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { callId, candidate } = body;

  if (!callId || typeof callId !== "string") {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  if (!candidate || typeof candidate !== "object") {
    return NextResponse.json({ error: "candidate is required" }, { status: 400 });
  }

  const call = await getCallForParticipant(callId, user.id);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (!["ringing", "connecting"].includes(call.status)) {
    return NextResponse.json({ error: "Call is not active" }, { status: 409 });
  }

  await prisma.callIceCandidate.create({
    data: {
      callId,
      fromUserId: user.id,
      candidate: JSON.stringify(candidate),
    },
  });

  return NextResponse.json({ ok: true });
}
