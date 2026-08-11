import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

  let body: { msgId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { msgId } = body;

  if (!msgId || typeof msgId !== "string") {
    return NextResponse.json({ error: "msgId is required" }, { status: 400 });
  }

  const message = await prisma.message.findUnique({
    where: { msgId },
    select: { msgId: true, toId: true, status: true },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.toId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (message.status === "READ") {
    return NextResponse.json(message);
  }

  const updated = await prisma.message.update({
    where: { msgId },
    data: { status: "READ" },
  });

  return NextResponse.json(updated);
}
