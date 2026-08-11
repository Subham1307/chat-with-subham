import { NextResponse } from "next/server";
import { canChatWith, requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

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

  if (toId === user.id) {
    return NextResponse.json(
      { error: "Cannot send a message to yourself" },
      { status: 400 },
    );
  }

  const allowed = await canChatWith(user.role, user.id, toId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You can only send messages to admin" },
      { status: 403 },
    );
  }

  const message = await prisma.message.create({
    data: {
      text: text.trim(),
      fromId: user.id,
      toId,
    },
  });

  return NextResponse.json(message, { status: 201 });
}
