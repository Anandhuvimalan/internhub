import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { enqueue, notify, audit } from "@/lib/events";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { addMonths, parseLocalDateTime } from "@/lib/format";

// ── Lead capture (public) ───────────────────────────────────────────

export const leadInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  course: z.string().trim().max(120).optional().or(z.literal("")),
  preferredDuration: z.coerce.number().int().min(1).max(4).optional(),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.string().trim().max(40).optional(),
});

/** Step 1: enquiry only. No account is created until admission is approved. */
export async function createLead(raw: unknown) {
  const input = leadInput.parse(raw);
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        course: input.course || null,
        preferredDuration: input.preferredDuration ?? null,
        message: input.message || null,
        source: input.source ?? "website",
      },
    });
    await enqueue(tx, "email.lead_ack", { leadId: lead.id, to: lead.email, name: lead.name }, `lead_ack:${lead.id}`);
    const staff = await tx.roleAssignment.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { userId: true } });
    await notify(tx, staff.map((s) => s.userId), {
      category: "ACTION",
      type: "lead.new",
      title: `New lead: ${lead.name}`,
      body: lead.course ?? undefined,
      link: "/admin/leads",
    });
    return lead;
  });
}

export async function setLeadStatus(u: CurrentUser, leadId: string, status: "CONTACTED" | "REJECTED" | "NEW", notes?: string) {
  if (!u.can("leads:manage")) throw forbidden();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw notFound("Lead");
  if (lead.status === "ADMITTED") throw conflict("Lead is already admitted");
  return db.$transaction(async (tx) => {
    const updated = await tx.lead.update({ where: { id: leadId }, data: { status, notes: notes ?? lead.notes } });
    await audit(tx, { actorId: u.id, entity: "Lead", entityId: leadId, action: `status:${status}`, before: { status: lead.status }, after: { status } });
    return updated;
  });
}

// ── Admission (step 2) ───────────────────────────────────────────────

export const admitInput = z.object({
  internshipId: z.string().min(1, "Choose an internship"),
  durationMonths: z.coerce.number().int().min(1).max(4),
  startDate: z.string().min(1, "Start date is required"),
});

async function nextStudentCode(tx: Tx, year: number) {
  const row = await tx.idCounter.upsert({
    where: { key: `student:${year}` },
    create: { key: `student:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `INT-${year}-${String(row.value).padStart(5, "0")}`;
}

/**
 * Approve a lead: generate unique student ID, create/attach the account,
 * enroll with its own duration, queue the activation welcome email.
 */
export async function admitLead(u: CurrentUser, leadId: string, raw: unknown) {
  if (!u.can("admissions:approve")) throw forbidden();
  const input = admitInput.parse(raw);
  const startDate = parseLocalDateTime(input.startDate);
  const endDate = addMonths(startDate, input.durationMonths);

  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw notFound("Lead");
    if (lead.status === "ADMITTED") throw conflict("Lead is already admitted");
    const internship = await tx.internship.findUnique({ where: { id: input.internshipId } });
    if (!internship) throw notFound("Internship");
    if (endDate > addMonths(internship.endDate, 1))
      throw badRequest("This duration runs well past the internship batch end date — extend the batch first.");

    let user = await tx.user.findUnique({ where: { email: lead.email } });
    const activationToken = randomBytes(24).toString("base64url");
    if (!user) {
      user = await tx.user.create({
        data: {
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
          status: "INVITED",
          activationToken,
          studentCode: await nextStudentCode(tx, startDate.getUTCFullYear()),
        },
      });
    } else if (!user.studentCode) {
      user = await tx.user.update({
        where: { id: user.id },
        data: { studentCode: await nextStudentCode(tx, startDate.getUTCFullYear()) },
      });
    }
    // (compound unique can't match NULL teamId in Postgres, so check explicitly)
    const hasStudentRole = await tx.roleAssignment.findFirst({ where: { userId: user.id, role: "STUDENT" } });
    if (!hasStudentRole) await tx.roleAssignment.create({ data: { userId: user.id, role: "STUDENT" } });

    const enrollment = await tx.enrollment.create({
      data: { userId: user.id, internshipId: internship.id, durationMonths: input.durationMonths, startDate, endDate },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "ADMITTED", convertedUserId: user.id } });

    await enqueue(
      tx,
      "email.welcome",
      {
        userId: user.id,
        to: user.email,
        name: user.name,
        studentCode: user.studentCode,
        internship: internship.name,
        durationMonths: input.durationMonths,
        startDate: startDate.toISOString(),
        activationToken: user.status === "INVITED" ? user.activationToken ?? activationToken : null,
      },
      `welcome:${user.id}:${internship.id}`,
    );
    await audit(tx, { actorId: u.id, entity: "Enrollment", entityId: enrollment.id, action: "admit", after: { leadId, ...input } });
    return { user, enrollment };
  });
}

// ── Account activation ──────────────────────────────────────────────

export async function activateAccount(token: string, password: string) {
  if (password.length < 10) throw badRequest("Password must be at least 10 characters");
  const user = await db.user.findUnique({ where: { activationToken: token } });
  if (!user) throw notFound("Activation link");
  return db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), status: "ACTIVE", activationToken: null },
  });
}

// ── Enrollment exceptions (extension, leave, withdrawal) ───────────

export async function updateEnrollment(
  u: CurrentUser,
  enrollmentId: string,
  change: { status?: "ACTIVE" | "ON_LEAVE" | "EXTENDED" | "WITHDRAWN" | "COMPLETED"; extendMonths?: number },
) {
  if (!u.can("internships:manage")) throw forbidden();
  const e = await db.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!e) throw notFound("Enrollment");
  return db.$transaction(async (tx) => {
    const data: { status?: typeof change.status; endDate?: Date; durationMonths?: number } = {};
    if (change.extendMonths) {
      data.endDate = addMonths(e.endDate, change.extendMonths);
      data.durationMonths = e.durationMonths + change.extendMonths;
      data.status = "EXTENDED";
    }
    if (change.status) data.status = change.status;
    const updated = await tx.enrollment.update({ where: { id: e.id }, data });
    if (change.status === "WITHDRAWN") {
      // close team membership but keep history
      await tx.teamMember.updateMany({ where: { userId: e.userId, leftAt: null, team: { internshipId: e.internshipId } }, data: { leftAt: new Date() } });
    }
    await audit(tx, { actorId: u.id, entity: "Enrollment", entityId: e.id, action: "update", before: e, after: updated });
    return updated;
  });
}
