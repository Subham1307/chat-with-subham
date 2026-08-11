import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaClientKey?: string;
};

// Bump this when the Prisma schema changes so dev hot-reload gets a fresh client.
const PRISMA_CLIENT_KEY = "role-friend-v1";

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function getPrismaClient() {
  if (
    process.env.NODE_ENV !== "production" &&
    globalForPrisma.prismaClientKey !== PRISMA_CLIENT_KEY
  ) {
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaClientKey = PRISMA_CLIENT_KEY;
  }

  globalForPrisma.prisma ??= createPrismaClient();

  return globalForPrisma.prisma;
}

export const prisma = getPrismaClient();
