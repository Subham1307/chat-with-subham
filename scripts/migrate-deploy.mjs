import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const directUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL?.replace("-pooler.", ".");

if (!directUrl) {
  console.error("DATABASE_URL (or DIRECT_URL) is required for migrations");
  process.exit(1);
}

console.log(
  "Running prisma migrate deploy via direct database connection…",
);

execSync("npx prisma migrate deploy", {
  env: {
    ...process.env,
    DATABASE_URL: directUrl,
    // Vercel builds previously used the pooled URL and could leave stale locks.
    ...(process.env.VERCEL ? { PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" } : {}),
  },
  stdio: "inherit",
});
