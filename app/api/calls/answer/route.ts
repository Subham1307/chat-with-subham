import { NextResponse } from "next/server";
import { getCallForParticipant, serializeCall } from "@/lib/calls/service";
import { requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

  let body: { callId?: string; sdp?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { callId, sdp } = body;

  if (!callId || typeof callId !== "string") {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  if (!sdp || typeof sdp !== "string") {
    return NextResponse.json({ error: "sdp is required" }, { status: 400 });
  }

  const call = await getCallForParticipant(callId, user.id);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (call.calleeId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (call.status !== "ringing") {
    return NextResponse.json(
      { error: "Call is no longer available" },
      { status: 409 },
    );
  }

  const updated = await prisma.call.update({
    where: { id: callId },
    data: {
      status: "connecting",
      answerSdp: sdp,
      connectedAt: new Date(),
    },
    include: {
      caller: { select: { id: true, name: true, email: true, role: true } },
      callee: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  return NextResponse.json(serializeCall(updated));
}
