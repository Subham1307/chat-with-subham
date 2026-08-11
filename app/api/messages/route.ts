import { NextRequest, NextResponse } from "next/server";
import { auth, type UserRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES: UserRole[] = ["admin", "mother", "wife", "temp", "friend"];
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

function isUserRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

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

async function canChatWith(
  senderRole: UserRole,
  senderId: string,
  withUserId: string,
) {
  if (withUserId === senderId) return false;

  const partner = await prisma.user.findUnique({
    where: { id: withUserId },
    select: { id: true, role: true },
  });

  if (!partner) return false;
  if (senderRole !== "admin" && partner.role !== "admin") return false;

  return true;
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role, id: sessionUserId } = session.user;

  if (!isUserRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { role },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "No user found for this role" },
      { status: 404 },
    );
  }

  if (user.id !== sessionUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const withUserId = request.nextUrl.searchParams.get("withUserId");
  const afterParam = request.nextUrl.searchParams.get("after");
  const wait = request.nextUrl.searchParams.get("wait") === "true";

  if (withUserId) {
    const allowed = await canChatWith(role, user.id, withUserId);
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
