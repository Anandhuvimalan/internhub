import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { assertSameOrigin, ipFromHeaders, toAppError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { esc } from "@/emails/templates";

const req = (method: string, headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/v1/tasks/x", { method, headers });

describe("CSRF: Origin check on cookie-authenticated API mutations", () => {
  it("allows same-origin POST", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "http://localhost:3000", host: "localhost:3000" }))).not.toThrow();
  });
  it("blocks a foreign Origin", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://evil.example", host: "localhost:3000" }))).toThrow(AppError);
  });
  it("blocks Sec-Fetch-Site: cross-site even without Origin", () => {
    expect(() => assertSameOrigin(req("PATCH", { "sec-fetch-site": "cross-site" }))).toThrow(AppError);
  });
  it("does not apply to GET", () => {
    expect(() => assertSameOrigin(req("GET", { origin: "https://evil.example" }))).not.toThrow();
  });
  it("allows non-browser clients (no Origin)", () => {
    expect(() => assertSameOrigin(req("POST", { host: "localhost:3000" }))).not.toThrow();
  });
});

describe("client IP for rate limiting", () => {
  it("ignores client-controlled X-Forwarded-For", () => {
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("direct");
  });
  it("uses only the configured trusted header", () => {
    expect(ipFromHeaders(new Headers({ "x-real-ip": "10.0.0.7", "x-forwarded-for": "1.2.3.4" }))).toBe("10.0.0.7");
  });
});

describe("database races surface as 409, not 500", () => {
  it("maps unique-constraint violation P2002", () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    const mapped = toAppError(err);
    expect(mapped).toBeInstanceOf(AppError);
    expect((mapped as AppError).status).toBe(409);
  });
});

describe("rate limiting (NFR-4)", () => {
  it("allows the limit, then 429 with Retry-After", async () => {
    const key = `acct:${Math.random()}`;
    for (let i = 0; i < 5; i++) await checkRateLimit("login", key);
    const err = await checkRateLimit("login", key).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBeGreaterThan(0);
  });
  it("counts each key separately (one student can't lock out another)", async () => {
    const a = `acct:${Math.random()}`;
    for (let i = 0; i < 5; i++) await checkRateLimit("login", a);
    await expect(checkRateLimit("login", `acct:${Math.random()}`)).resolves.toBeUndefined();
  });
});

describe("email HTML escaping", () => {
  it("neutralizes markup in user-supplied names", () => {
    expect(esc(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
