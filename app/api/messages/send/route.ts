import { NextResponse } from "next/server";
import { auth, type UserRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES: UserRole[] = ["admin", "mother", "wife", "temp", "friend"];

function isUserRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role, id: sessionUserId } = session.user;

  if (!isUserRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 403 });
  }

  const sender = await prisma.user.findUnique({
    where: { role },
    select: { id: true, role: true },
  });

  if (!sender) {
    return NextResponse.json(
      { error: "No user found for this role" },
      { status: 404 },
    );
  }

  if (sender.id !== sessionUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { toId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { toId, text } = body;

  if (!toId || typeof toId !== "string") {
    return NextResponse.json({ error: "toId is required" }, { status: 400 });
  }

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (toId === sender.id) {
    return NextResponse.json(
      { error: "Cannot send a message to yourself" },
      { status: 400 },
    );
  }

  const recipient = await prisma.user.findUnique({
    where: { id: toId },
    select: { id: true, role: true },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  if (role !== "admin" && recipient.role !== "admin") {
    return NextResponse.json(
      { error: "You can only send messages to admin" },
      { status: 403 },
    );
  }

  const message = await prisma.message.create({
    data: {
      text: text.trim(),
      fromId: sender.id,
      toId: recipient.id,
    },
  });

  return NextResponse.json(message, { status: 201 });
}
