import { NextResponse } from "next/server";
import { auth, type UserRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES: UserRole[] = ["admin", "mother", "wife", "temp", "friend"];

const chatUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
} as const;

function isUserRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

export async function GET() {
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

  if (role === "admin") {
    const users = await prisma.user.findMany({
      where: { id: { not: sessionUserId } },
      select: chatUserSelect,
      orderBy: { role: "asc" },
    });
    return NextResponse.json(users);
  }

  const admin = await prisma.user.findUnique({
    where: { role: "admin" },
    select: chatUserSelect,
  });

  return NextResponse.json(admin ? [admin] : []);
}
