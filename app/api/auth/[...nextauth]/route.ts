import NextAuth from "next-auth";
import { AUTH_CONFIG } from "@/lib/auth";

const handler = NextAuth(AUTH_CONFIG);

export { handler as GET, handler as POST };
