import { execSync } from "node:child_process";

/**
 * Integration tests run against a real PostgreSQL database (never the dev or production DB).
 * Creates it if missing and applies every migration — the same command production uses.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/internhub_test?schema=internship";
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  if (!/^[\w-]+test[\w-]*$/.test(dbName)) throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  try {
    execSync(`psql "${admin}" -tAc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || psql "${admin}" -c "CREATE DATABASE \\"${dbName}\\""`, { stdio: "pipe", shell: "/bin/bash" });
  } catch (e) {
    throw new Error(`Could not reach/create test database: ${(e as Error).message}`);
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
