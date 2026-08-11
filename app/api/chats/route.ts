import { NextResponse } from "next/server";
import { canChatWith, requireAuthUser } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAuthUser();
  if (authResult.error) return authResult.error;

  const { user } = authResult;

  if (user.role === "admin") {
    const users = await prisma.user.findMany({
      where: { id: { not: user.id } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { role: "asc" },
    });
    return NextResponse.json(users);
  }

  const admin = await prisma.user.findUnique({
    where: { role: "admin" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  return NextResponse.json(admin ? [admin] : []);
}
