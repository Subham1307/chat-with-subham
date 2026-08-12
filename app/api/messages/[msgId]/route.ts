import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ msgId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;
  const { msgId } = await context.params;

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text } = body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const message = await prisma.message.findUnique({
    where: { msgId },
    select: { msgId: true, fromId: true },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.fromId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.message.update({
    where: { msgId },
    data: { text: text.trim() },
  });

  return NextResponse.json(updated);
}
