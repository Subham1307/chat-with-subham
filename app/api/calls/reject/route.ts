import { NextResponse } from "next/server";
import { cleanupCall, getCallForParticipant } from "@/lib/calls/service";
import { requireAuthUser } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

  let body: { callId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { callId } = body;

  if (!callId || typeof callId !== "string") {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  const call = await getCallForParticipant(callId, user.id);
  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (call.calleeId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (call.status !== "ringing") {
    return NextResponse.json({ error: "Call is no longer ringing" }, { status: 409 });
  }

  await cleanupCall(callId, "rejected");

  return NextResponse.json({ ok: true });
}
