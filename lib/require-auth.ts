import { NextResponse } from "next/server";
import { auth, type UserRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = new Set<UserRole>([
  "admin",
  "mother",
  "wife",
  "temp",
  "friend",
]);

function isUserRole(role: string): role is UserRole {
  return VALID_ROLES.has(role as UserRole);
}

type AuthSuccess = {
  error?: undefined;
  user: {
    id: string;
    role: UserRole;
  };
};

type AuthFailure = {
  error: NextResponse;
  user?: undefined;
};

export async function requireAuthUser(): Promise<AuthSuccess | AuthFailure> {
  const session = await auth();

  if (!session?.user?.role || !session.user.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { role, id: sessionUserId } = session.user;

  if (!isUserRole(role)) {
    return {
      error: NextResponse.json({ error: "Invalid role" }, { status: 403 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { role },
    select: { id: true, role: true },
  });

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "No user found for this role" },
        { status: 404 },
      ),
    };
  }

  if (user.id !== sessionUserId) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    user: {
      id: user.id,
      role: user.role,
    },
  };
}

export async function canChatWith(
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
