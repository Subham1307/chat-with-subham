import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { Role } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type UserRole = Role;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production`);
  }
  return value ?? "";
}

export function getRoleFromEmail(email: string): Role {
  const normalized = email.toLowerCase();
  if (normalized.includes("subham")) return Role.admin;
  if (normalized.includes("alpana")) return Role.mother;
  if (normalized.includes("jethalal")) return Role.temp;
  if (normalized.includes("hackoverflow")) return Role.friend;
  return Role.friend;
}

export const AUTH_CONFIG: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;
      if (!user.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existingUser) {
        const role = getRoleFromEmail(user.email);
        const newUser = await prisma.user.create({
          data: {
            email: user.email,
            name: user.name ?? null,
            image: null,
            role,
          },
        });
        user.id = newUser.id;
        user.role = newUser.role;
      } else {
        user.id = existingUser.id;
        user.role = existingUser.role;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role ?? getRoleFromEmail(user.email ?? "");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

export function auth() {
  return getServerSession(AUTH_CONFIG);
}
