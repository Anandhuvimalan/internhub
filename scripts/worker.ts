/**
 * Background worker — delivers the transactional outbox.
 *
 *   npm run worker
 *
 * • Claims due events with FOR UPDATE SKIP LOCKED, so several worker
 *   containers can run side by side without double-sending.
 * • Retries with exponential backoff; after MAX_ATTEMPTS the event is marked
 *   FAILED (dead letter) and stays visible for inspection.
 * • Email sending is throttled to EMAIL_PER_MINUTE to respect provider quotas;
 *   if the provider is down, events simply wait — the app keeps working.
 */
import { PrismaClient, type OutboxEvent } from "@prisma/client";
import nodemailer from "nodemailer";
import * as tpl from "../src/emails/templates";

const db = new PrismaClient();
const MAX_ATTEMPTS = 6;
const BATCH = 20;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
const EMAIL_PER_MINUTE = Number(process.env.EMAIL_PER_MINUTE ?? 60);
const FROM = process.env.EMAIL_FROM ?? "InternHub <no-reply@internhub.local>";

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
let sentThisMinute = 0;
setInterval(() => (sentThisMinute = 0), 60_000).unref();

const fmt = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(d));

class Throttled extends Error {}

async function sendMail(to: string, mail: { subject: string; html: string }) {
  if (sentThisMinute >= EMAIL_PER_MINUTE) throw new Throttled("email rate budget exhausted");
  sentThisMinute++;
  if (!transport) {
    console.log(`[mail:dev] → ${to} | ${mail.subject}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject: mail.subject, html: mail.html });
}

type Handler = (e: OutboxEvent, p: Record<string, unknown>) => Promise<void>;

const handlers: Record<string, Handler> = {
  "email.lead_ack": async (_e, p) => sendMail(String(p.to), tpl.leadAck({ name: String(p.name) })),

  "email.welcome": async (_e, p) =>
    sendMail(
      String(p.to),
      tpl.welcome({
        name: String(p.name),
        studentCode: String(p.studentCode),
        internship: String(p.internship),
        durationMonths: Number(p.durationMonths),
        startDate: String(p.startDate),
        activationToken: (p.activationToken as string | null) ?? null,
      }),
    ),

  "email.meeting_invite": async (_e, p) => {
    const m = await db.meeting.findUnique({ where: { id: String(p.meetingId) } });
    if (!m || m.status !== "SCHEDULED") return;
    const users = await db.user.findMany({ where: { id: { in: p.userIds as string[] } }, select: { email: true } });
    const mail = tpl.meetingInvite({ title: m.title, type: m.type.replace(/_/g, " ").toLowerCase(), when: fmt(m.startsAt), url: m.meetingUrl, id: m.id });
    for (const u of users) await sendMail(u.email, mail);
  },

  "meeting.reminder": async (_e, p) => {
    const m = await db.meeting.findUnique({ where: { id: String(p.meetingId) }, include: { participants: { where: { rsvp: { not: "DECLINED" } }, include: { user: true } } } });
    // stale reminder (meeting moved/cancelled) → drop silently
    if (!m || m.status !== "SCHEDULED" || m.startsAt.toISOString() !== p.startsAt) return;
    const mins = Number(p.minutesBefore);
    await db.notification.createMany({
      data: m.participants.map((pt) => ({
        userId: pt.userId,
        category: "UPCOMING" as const,
        type: "meeting.reminder",
        title: `Starting ${mins >= 1440 ? "tomorrow" : `in ${mins >= 60 ? mins / 60 + "h" : mins + "m"}`}: ${m.title}`,
        body: `${fmt(m.startsAt)} IST`,
        link: `/meetings/${m.id}`,
      })),
    });
    const mail = tpl.meetingReminder({ title: m.title, when: fmt(m.startsAt), minutesBefore: mins, url: m.meetingUrl, id: m.id });
    for (const pt of m.participants) await sendMail(pt.user.email, mail);
  },

  "review.escalation": async (_e, p) => {
    const reviewed = await db.review.count({ where: { submissionId: String(p.submissionId) } });
    if (reviewed) return;
    const task = await db.task.findUnique({ where: { id: String(p.taskId) }, include: { project: { include: { team: true } } } });
    if (!task || task.status !== "IN_REVIEW") return;
    const staff = await db.roleAssignment.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { userId: true } });
    const to = [...new Set([...(task.project.team.mentorId ? [task.project.team.mentorId] : []), ...staff.map((s) => s.userId)])];
    await db.notification.createMany({
      data: to.map((userId) => ({
        userId,
        category: "ACTION" as const,
        type: "review.overdue",
        title: `Review overdue: ${task.title}`,
        body: `Team ${task.project.team.name} has waited over ${process.env.REVIEW_SLA_HOURS ?? 48}h`,
        link: `/tasks/${task.id}`,
      })),
    });
  },
};

async function claim(): Promise<OutboxEvent[]> {
  return db.$queryRaw<OutboxEvent[]>`
    UPDATE internship."OutboxEvent" SET status = 'PROCESSING', attempts = attempts + 1, "availableAt" = now()
    WHERE id IN (
      SELECT id FROM internship."OutboxEvent"
      WHERE status = 'PENDING' AND "availableAt" <= now()
      ORDER BY "availableAt" LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    ) RETURNING *`;
}

async function processOne(e: OutboxEvent) {
  const h = handlers[e.type];
  try {
    if (!h) throw new Error(`No handler for ${e.type}`);
    await h(e, e.payload as Record<string, unknown>);
    await db.outboxEvent.update({ where: { id: e.id }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
  } catch (err) {
    const throttled = err instanceof Throttled;
    const dead = !throttled && e.attempts >= MAX_ATTEMPTS;
    const delayMs = throttled ? 60_000 : Math.min(2 ** e.attempts * 30_000, 3_600_000);
    await db.outboxEvent.update({
      where: { id: e.id },
      data: {
        status: dead ? "FAILED" : "PENDING",
        attempts: throttled ? { decrement: 1 } : undefined,
        availableAt: new Date(Date.now() + delayMs),
        lastError: String((err as Error).message ?? err).slice(0, 500),
      },
    });
    if (!throttled) console.error(`[worker] ${e.type} ${e.id} failed (attempt ${e.attempts})${dead ? " → dead letter" : ""}:`, (err as Error).message);
  }
}

/** Events stuck in PROCESSING (worker crashed) go back to the queue. */
async function recoverStuck() {
  await db.outboxEvent.updateMany({
    where: { status: "PROCESSING", availableAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "PENDING" },
  });
}

let running = true;
async function main() {
  console.log(`[worker] started (mail: ${transport ? "SMTP" : "console"}, ${EMAIL_PER_MINUTE}/min)`);
  let tick = 0;
  while (running) {
    if (tick++ % 60 === 0) await recoverStuck();
    const batch = await claim();
    for (const e of batch) await processOne(e);
    if (process.argv.includes("--once") && batch.length === 0) break;
    if (batch.length < BATCH) await new Promise((r) => setTimeout(r, process.argv.includes("--once") ? 50 : POLL_MS));
  }
  await db.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (running = false));
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
