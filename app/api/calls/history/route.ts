import { NextRequest, NextResponse } from "next/server";
import { getConversationCalls } from "@/lib/calls/service";
import { canChatWith, requireAuthUser } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;
  const withUserId = request.nextUrl.searchParams.get("withUserId");
  const afterParam = request.nextUrl.searchParams.get("after");

  if (!withUserId) {
    return NextResponse.json({ error: "withUserId is required" }, { status: 400 });
  }

  if (withUserId === user.id) {
    return NextResponse.json({ error: "Cannot list calls with yourself" }, { status: 400 });
  }

  const allowed = await canChatWith(user.role, user.id, withUserId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const after = afterParam ? new Date(afterParam) : null;
  if (after && Number.isNaN(after.getTime())) {
    return NextResponse.json({ error: "Invalid after timestamp" }, { status: 400 });
  }

  const calls = await getConversationCalls(user.id, withUserId, after);
  return NextResponse.json(calls);
}
