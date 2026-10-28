import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/events";
import { lockAdminChanges } from "../bootstrap";
import { forbidden, conflict } from "@/lib/errors";

const staffRoles = z.array(z.enum(["SUPER_ADMIN", "ADMIN", "MENTOR", "REVIEWER"])).min(1).max(4).transform(r => [...new Set(r)]);
const normalizeRoles = (raw: unknown) => { const input = z.record(z.string(), z.unknown()).parse(raw); return { ...input, roles: input.roles ?? [input.role] }; };
const staffInput = z.object({
  name: z.string().trim().min(2).max(120), email: z.email().toLowerCase(),
  roles: staffRoles,
  password: z.string().min(12).max(128),
});
export async function createStaff(u: CurrentUser, raw: unknown) {
  if (!u.can("settings:manage")) throw forbidden();
  const input = staffInput.parse(normalizeRoles(raw));
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async tx => {
    const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash, status: "ACTIVE", roles: { create: input.roles.map(role => ({ role })) } } });
    await audit(tx, { actorId: u.id, entity: "User", entityId: user.id, action: "staff.create", after: { roles: input.roles } });
    return { id: user.id };
  });
}
export async function updateStaff(u: CurrentUser, id: string, raw: unknown) {
  if (!u.can("settings:manage")) throw forbidden();
  const input = z.object({ roles: staffRoles, status: z.enum(["ACTIVE", "SUSPENDED"]) }).parse(normalizeRoles(raw));
  return db.$transaction(async tx => {
    // Serialize changes to prevent two administrators removing the last active super-admin.
    await lockAdminChanges(tx);
    const user = await tx.user.findUniqueOrThrow({ where: { id }, include: { roles: true } });
    if (user.studentCode || user.roles.some(r => ["STUDENT", "TEAM_LEADER"].includes(r.role))) throw conflict("Use student administration for this account");
    if (user.roles.some(r => r.role === "SUPER_ADMIN") && (!input.roles.includes("SUPER_ADMIN") || input.status !== "ACTIVE")) {
      const others = await tx.user.count({ where: { id: { not: id }, status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } } });
      if (!others) throw conflict("Keep at least one active super-admin");
    }
    await tx.permissionGrant.deleteMany({ where: { userId: id } });
    await tx.roleAssignment.deleteMany({ where: { userId: id } });
    await tx.roleAssignment.createMany({ data: input.roles.map(role => ({ userId: id, role })) });
    await tx.user.update({ where: { id }, data: { status: input.status, sessionVersion: { increment: 1 } } });
    await audit(tx, { actorId: u.id, entity: "User", entityId: id, action: "staff.update", after: input });
  });
}
const task = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(10000).optional(), acceptanceCriteria: z.string().max(10000).optional(), deliverables: z.string().max(10000).optional(), offsetDays: z.number().int().min(0), lengthDays: z.number().int().min(1), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), isTeamTask: z.boolean().default(false) });
export const templateInput = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().max(10000).optional(), track: z.string().trim().min(1).max(120), durationWeeks: z.number().int().min(1).max(52),
  phases: z.array(z.object({ title: z.string().trim().min(1).max(200), offsetDays: z.number().int().min(0), lengthDays: z.number().int().min(1), presentationRequired: z.boolean().default(false), tasks: z.array(task).min(1).max(100) })).min(1).max(30),
}).superRefine((t, ctx) => {
  let end = 0;
  t.phases.forEach((p, i) => {
    if (p.offsetDays < end || p.offsetDays + p.lengthDays > t.durationWeeks * 7) ctx.addIssue({ code: "custom", path: ["phases", i], message: "Phases must be ordered, non-overlapping and within the project duration" });
    end = p.offsetDays + p.lengthDays;
    p.tasks.forEach((task, j) => { if (task.offsetDays + task.lengthDays > p.lengthDays) ctx.addIssue({ code: "custom", path: ["phases", i, "tasks", j], message: "Task schedule exceeds its phase" }); });
  });
});
export async function saveTemplate(u: CurrentUser, raw: unknown, id?: string) {
  if (!u.can("projects:manage")) throw forbidden();
  const { phases, ...input } = templateInput.parse(raw);
  return db.$transaction(async tx => {
    const template = id ? await tx.projectTemplate.update({ where: { id }, data: input }) : await tx.projectTemplate.create({ data: input });
    if (id) await tx.phaseTemplate.deleteMany({ where: { templateId: id } });
    for (const [i, { tasks, ...phase }] of phases.entries()) await tx.phaseTemplate.create({ data: { ...phase, order: i + 1, templateId: template.id, tasks: { create: tasks } } });
    await audit(tx, { actorId: u.id, entity: "ProjectTemplate", entityId: template.id, action: id ? "update" : "create" });
    return template;
  });
}
