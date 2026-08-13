import { NextRequest, NextResponse } from "next/server";
import { canChatWith, requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const POLL_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 1_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function conversationFilter(userId: string, withUserId: string) {
  return {
    OR: [
      { fromId: userId, toId: withUserId },
      { fromId: withUserId, toId: userId },
    ],
  };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;
  const withUserId = request.nextUrl.searchParams.get("withUserId");
  const afterParam = request.nextUrl.searchParams.get("after");
  const wait = request.nextUrl.searchParams.get("wait") === "true";

  if (withUserId) {
    const allowed = await canChatWith(user.role, user.id, withUserId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const after = afterParam ? new Date(afterParam) : null;

    if (wait && after && !Number.isNaN(after.getTime())) {
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const newMessages = await prisma.message.findMany({
          where: {
            ...conversationFilter(user.id, withUserId),
            sentAt: { gt: after },
          },
          orderBy: { sentAt: "asc" },
        });

        if (newMessages.length > 0) {
          return NextResponse.json(newMessages);
        }

        await sleep(POLL_INTERVAL_MS);
      }

      return NextResponse.json([]);
    }

    const messages = await prisma.message.findMany({
      where: conversationFilter(user.id, withUserId),
      orderBy: { sentAt: "asc" },
    });

    return NextResponse.json(messages);
  }

  const messages = await prisma.message.findMany({
    where: {
      OR: [{ fromId: user.id }, { toId: user.id }],
    },
    orderBy: { sentAt: "asc" },
  });

  return NextResponse.json(messages);
}
