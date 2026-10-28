import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createStaff, updateStaff, saveTemplate } from "@/server/services/administration";
import { beginLogin, enrollmentInfo, finishLogin } from "@/server/mfa";
import { resolveSessionToken, signSessionToken } from "@/lib/session";
import { totp } from "@/lib/totp";
import { asUser, makeUser, makeStaff, expectStatus, uid, makeTeam } from "../factories";
import { assignTemplate } from "@/server/services/projects";
it("denies staff changes to ordinary admins, revokes staff sessions on access change", async () => {
  const admin = await makeStaff();
  await expectStatus(createStaff(admin, {}), 403);
  const owner = await asUser((await makeUser(["SUPER_ADMIN"])).id);
  const staff = await createStaff(owner, { name: "New mentor", email: `mentor-${uid()}@test.dev`, password: "long-initial-password", role: "MENTOR" });
  const token = await signSessionToken(staff.id, 0);
  expect(await resolveSessionToken(token)).not.toBeNull();
  await updateStaff(owner, staff.id, { role: "REVIEWER", status: "SUSPENDED" });
  expect(await resolveSessionToken(token)).toBeNull();
});
it("validates template schedules and preserves assigned project copies", async () => {
  const admin = await makeStaff();
  const input = { title: "Template", track: "Full Stack", durationWeeks: 2, phases: [{ title: "Build", offsetDays: 0, lengthDays: 14, tasks: [{ title: "Prototype", offsetDays: 0, lengthDays: 7 }] }] };
  await expect(saveTemplate(admin, { ...input, durationWeeks: 1 })).rejects.toThrow();
  const t = await saveTemplate(admin, input);
  const { team } = await makeTeam();
  const project = await assignTemplate(admin, { templateId: t.id, teamId: team.id, startDate: "2026-10-27" });
  await saveTemplate(admin, { ...input, title: "Revised" }, t.id);
  expect((await db.project.findUniqueOrThrow({ where: { id: project.id } })).title).toBe("Template");
});
describe("admin MFA", () => {
  it("enforces enrollment, serializes replay, and consumes recovery codes once", async () => {
    const u = await makeUser(["ADMIN"]);
    expect(await resolveSessionToken(await signSessionToken(u.id, 0))).toBeNull();
    const challenge = (await beginLogin(u.id))!;
    const { secret } = await enrollmentInfo(challenge);
    await expectStatus(finishLogin(challenge, "wrong"), 401);
    const code = totp(secret!);
    const results = await Promise.allSettled([finishLogin(challenge, code), finishLogin(challenge, code)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const success = results.find(r => r.status === "fulfilled")!;
    if (success.status !== "fulfilled") throw new Error("expected success");
    expect(success.value.recoveryCodes).toHaveLength(10);
    expect(await resolveSessionToken(await signSessionToken(u.id, success.value.sessionVersion, true))).not.toBeNull();
    await expectStatus(finishLogin((await beginLogin(u.id))!, code), 401);
    const recovery = success.value.recoveryCodes[0];
    await finishLogin((await beginLogin(u.id))!, recovery);
    await expectStatus(finishLogin((await beginLogin(u.id))!, recovery), 401);
  });
  it("expires challenges, persists invalid attempts, and binds to session version", async () => {
    const u = await makeUser(["SUPER_ADMIN"]);
    const token = (await beginLogin(u.id))!;
    for (let i = 0; i < 5; i++) await expectStatus(finishLogin(token, "wrong"), 401);
    await expectStatus(enrollmentInfo(token), 401);
    const expired = (await beginLogin(u.id))!;
    await db.loginChallenge.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(0) } });
    await expectStatus(finishLogin(expired, "000000"), 401);
    const stale = (await beginLogin(u.id))!;
    await db.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } });
    await expectStatus(enrollmentInfo(stale), 401);
  });
});
it("serializes removal of the last active super-admin and clears extra grants", async () => {
  const existing = await db.roleAssignment.findMany({ where: { role: "SUPER_ADMIN" } });
  await db.roleAssignment.deleteMany({ where: { id: { in: existing.map(r => r.id) } } });
  const first = await makeUser(["SUPER_ADMIN"]), second = await makeUser(["SUPER_ADMIN"]);
  try {
    const actor = await asUser(first.id);
    await db.permissionGrant.create({ data: { userId: second.id, permission: "settings:manage" } });
    const result = await Promise.allSettled([updateStaff(actor, first.id, { role: "REVIEWER", status: "ACTIVE" }), updateStaff(actor, second.id, { role: "REVIEWER", status: "ACTIVE" })]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const remaining = await db.user.count({ where: { id: { in: [first.id, second.id] }, status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } } });
    expect(remaining).toBe(1);
    const changed = await db.user.findFirstOrThrow({ where: { id: { in: [first.id, second.id] }, roles: { some: { role: "REVIEWER" } } } });
    expect(await db.permissionGrant.count({ where: { userId: changed.id } })).toBe(0);
  } finally {
    await db.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    if (existing.length) await db.roleAssignment.createMany({ data: existing });
  }
});
it("recovery sign-in can replace a lost authenticator without leaving old codes or sessions valid", async () => {
  const { beginMfaReplacement } = await import("@/server/mfa");
  const { hashPassword } = await import("@/lib/password");
  const user = await makeUser(["ADMIN"]);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("initial-password-123") } });
  const challenge = (await beginLogin(user.id))!;
  const { secret } = await enrollmentInfo(challenge);
  const enrollment = await finishLogin(challenge, totp(secret!));
  const recovered = await finishLogin((await beginLogin(user.id))!, enrollment.recoveryCodes[0]);
  const actor = await asUser(user.id);
  await expectStatus(beginMfaReplacement(actor, "wrong"), 401);
  const replacement = await beginMfaReplacement(actor, "initial-password-123");
  const info = await enrollmentInfo(replacement);
  expect(info.secret).not.toBe(secret);
  // An old recovery code cannot confirm a new authenticator.
  await expectStatus(finishLogin(replacement, enrollment.recoveryCodes[1]), 401);
  const result = await finishLogin(replacement, totp(info.secret!));
  expect(result.recoveryCodes).toHaveLength(10);
  expect(await resolveSessionToken(await signSessionToken(user.id, recovered.sessionVersion, true))).toBeNull();
  await expectStatus(finishLogin((await beginLogin(user.id))!, enrollment.recoveryCodes[1]), 401);
  expect((await db.auditLog.findFirst({ where: { entityId: user.id, action: "mfa.replace" } }))?.actorId).toBe(user.id);
});
it("password changes require current credentials and revoke every session", async () => {
  const { changePassword } = await import("@/server/account-security");
  const { hashPassword, verifyPassword } = await import("@/lib/password");
  const user = await makeUser();
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("initial-password-123") } });
  const token = await signSessionToken(user.id, 0), actor = await asUser(user.id);
  await expectStatus(changePassword(actor, { currentPassword: "wrong", newPassword: "replacement-password" }), 401);
  expect(await resolveSessionToken(token)).not.toBeNull();
  await changePassword(actor, { currentPassword: "initial-password-123", newPassword: "replacement-password" });
  expect(await resolveSessionToken(token)).toBeNull();
  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(await verifyPassword("replacement-password", after.passwordHash!)).toBe(true);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "password.change" } });
  expect(JSON.stringify(log)).not.toContain("replacement-password");
});
