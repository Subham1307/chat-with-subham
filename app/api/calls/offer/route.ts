import { NextResponse } from "next/server";
import { canChatWith, requireAuthUser } from "@/lib/require-auth";
import {
  cleanupCall,
  getActiveCallForUser,
  serializeCall,
} from "@/lib/calls/service";
import { prisma } from "@/lib/prisma";
import type { CallType } from "@/types/call";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

  let body: { toUserId?: string; type?: CallType; sdp?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { toUserId, type, sdp } = body;

  if (!toUserId || typeof toUserId !== "string") {
    return NextResponse.json({ error: "toUserId is required" }, { status: 400 });
  }

  if (type !== "audio" && type !== "video") {
    return NextResponse.json({ error: "type must be audio or video" }, { status: 400 });
  }

  if (!sdp || typeof sdp !== "string") {
    return NextResponse.json({ error: "sdp is required" }, { status: 400 });
  }

  if (toUserId === user.id) {
    return NextResponse.json({ error: "Cannot call yourself" }, { status: 400 });
  }

  const allowed = await canChatWith(user.role, user.id, toUserId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const callerActive = await getActiveCallForUser(user.id);
  if (callerActive) {
    return NextResponse.json({ error: "You are already in a call" }, { status: 409 });
  }

  const calleeActive = await getActiveCallForUser(toUserId);
  if (calleeActive) {
    const busyCall = await prisma.call.create({
      data: {
        callerId: user.id,
        calleeId: toUserId,
        type,
        status: "busy",
        offerSdp: null,
      },
    });
    await cleanupCall(busyCall.id, "busy");
    return NextResponse.json({ error: "User is busy" }, { status: 409 });
  }

  const call = await prisma.call.create({
    data: {
      callerId: user.id,
      calleeId: toUserId,
      type,
      status: "ringing",
      offerSdp: sdp,
    },
    include: {
      caller: { select: { id: true, name: true, email: true, role: true } },
      callee: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  return NextResponse.json(serializeCall(call), { status: 201 });
}
