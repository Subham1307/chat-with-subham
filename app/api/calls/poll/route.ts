import { NextRequest, NextResponse } from "next/server";
import { collectPollEvents, waitForPollEvents } from "@/lib/calls/service";
import { requireAuthUser } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 8;

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;
  const afterParam = request.nextUrl.searchParams.get("after");
  const wait = request.nextUrl.searchParams.get("wait") === "true";
  const activeCallId = request.nextUrl.searchParams.get("callId");

  const after = afterParam ? new Date(afterParam) : new Date(0);
  if (Number.isNaN(after.getTime())) {
    return NextResponse.json({ error: "Invalid after timestamp" }, { status: 400 });
  }

  const events = wait
    ? await waitForPollEvents(user.id, after, activeCallId)
    : await collectPollEvents(user.id, after, activeCallId);

  return NextResponse.json({ events });
}
