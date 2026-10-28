import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Integration tests run against a real PostgreSQL database (never the dev or production DB).
 * Creates it if missing and applies every migration — the same command production uses.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/internhub_test?schema=internship";
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  if (!/^[\w-]+test[\w-]*$/.test(dbName)) throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") ?? "prefer",
  };
  const psql = process.env.PSQL_BIN ?? "psql";
  const query = (sql: string) => execFileSync(psql, ["-X", "-w", "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], { env, encoding: "utf8", timeout: 15_000 });
  try {
    if (query(`SELECT 1 FROM pg_database WHERE datname='${dbName}'`).trim() !== "1") query(`CREATE DATABASE "${dbName}"`);
  } catch {
    throw new Error("Could not reach/create the isolated test database. Check TEST_DATABASE_URL and ensure psql is on PATH (or set PSQL_BIN).");
  }
  try {
    execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
  } catch {
    throw new Error("Could not apply migrations to the isolated test database.");
  }
}
