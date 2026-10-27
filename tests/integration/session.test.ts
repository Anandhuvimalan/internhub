import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkCredentials, hashPassword, resolveSessionToken, revokeSessions, signSessionToken, verifyPassword } from "@/lib/session";
import { makeUser } from "../factories";

describe("password hashing", () => {
  it("uses scrypt (memory-hard) and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$15$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("upgrades a legacy bcrypt hash on successful login", async () => {
    const u = await makeUser();
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash("legacy-password-1", 4) } });
    expect(await checkCredentials(u.email, "legacy-password-1")).toBe(u.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.passwordHash!.startsWith("scrypt$")).toBe(true);
  });

  it("rejects unknown email, wrong password and non-active accounts alike", async () => {
    const u = await makeUser([], { status: "SUSPENDED" });
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword("pw-suspended-1") } });
    expect(await checkCredentials("nobody-" + u.email, "x")).toBeNull();
    expect(await checkCredentials(u.email, "pw-suspended-1")).toBeNull();
  });
});

describe("session revocation (ADR-0003)", () => {
  it("a valid token resolves to the user with permissions", async () => {
    const u = await makeUser(["STUDENT"]);
    const cu = await resolveSessionToken(await signSessionToken(u.id, 0));
    expect(cu?.id).toBe(u.id);
    expect(cu?.can("submissions:create")).toBe(true);
  });

  it("logout/revocation invalidates every outstanding token immediately", async () => {
    const u = await makeUser();
    const t1 = await signSessionToken(u.id, 0);
    const t2 = await signSessionToken(u.id, 0); // a second device
    await revokeSessions(u.id);
    expect(await resolveSessionToken(t1)).toBeNull();
    expect(await resolveSessionToken(t2)).toBeNull();
  });

  it("suspension takes effect on the next request", async () => {
    const u = await makeUser();
    const t = await signSessionToken(u.id, 0);
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await resolveSessionToken(t)).toBeNull();
  });

  it("role removal takes effect on the next request", async () => {
    const u = await makeUser(["ADMIN"]);
    const t = await signSessionToken(u.id, 0);
    expect((await resolveSessionToken(t))?.isStaff).toBe(true);
    await db.roleAssignment.deleteMany({ where: { userId: u.id } });
    expect((await resolveSessionToken(t))?.isStaff).toBe(false);
  });

  it("tampered or garbage tokens are treated as signed out", async () => {
    const u = await makeUser();
    const t = await signSessionToken(u.id, 0);
    expect(await resolveSessionToken(t.slice(0, -3) + "abc")).toBeNull();
    expect(await resolveSessionToken("not.a.jwt")).toBeNull();
  });
});
