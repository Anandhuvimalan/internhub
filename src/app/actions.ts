"use server";
import { beginLogin } from "@/server/mfa";
import { setLoginChallenge } from "@/lib/auth";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import type { Rsvp, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, destroySession, homePathFor, requireUser } from "@/lib/auth";
import { checkCredentials, toCurrentUser } from "@/lib/session";
import { actionError, ipFromHeaders, type ActionState } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { forbidden } from "@/lib/errors";
import { parseLocalDateTime } from "@/lib/format";
import { activateAccount, admitLead, createLead, setLeadStatus, updateEnrollment } from "@/server/services/admissions";
import { allocateTeams, internshipInput, moveStudent, setLeader, setMentor } from "@/server/services/teams";
import { assignTemplate, changeTaskStatus, closeProject, createTask, reassignReviewer, setPhaseStatus, updateTaskDue } from "@/server/services/projects";
import { reviewSubmission, submitTask } from "@/server/services/reviews";
import {
  cancelMeeting,
  completeMeeting,
  createMeeting,
  decideRequest,
  evaluatePresentation,
  requestMeeting,
  reschedule,
  rsvp,
  updatePresentationMaterials,
} from "@/server/services/meetings";
import { markNotificationsRead } from "@/server/queries";

const obj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

async function ip() {
  return ipFromHeaders(await headers());
}

// ── Auth ─────────────────────────────────────────────────────────────

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  let home: string;
  try {
    await checkRateLimit("login", `acct:${email}`);
    await checkRateLimit("loginIp", `ip:${await ip()}`);
    const userId = await checkCredentials(email, password); // constant-ish time, rehashes legacy
    if (!userId) return { error: "Email or password is incorrect" };
    const challenge = await beginLogin(userId);
    if (challenge) { await setLoginChallenge(challenge); redirect("/login/mfa"); }
    await createSession(userId);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true, permissionGrants: true } });
    home = homePathFor(toCurrentUser(user));
  } catch (e) {
    return actionError(e);
  }
  redirect(home);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function activateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const pw = String(fd.get("password") ?? "");
    if (pw !== String(fd.get("confirm") ?? "")) return { error: "Passwords do not match" };
    const user = await activateAccount(String(fd.get("token")), pw);
    await createSession(user.id);
  } catch (e) {
    return actionError(e);
  }
  redirect("/workspace");
}

// ── Leads & admissions ──────────────────────────────────────────────

export async function submitLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await checkRateLimit("leadForm", await ip());
    await createLead(obj(fd));
    return { ok: true, message: "Thanks! We've emailed you an acknowledgement and will be in touch soon." };
  } catch (e) {
    return actionError(e);
  }
}

export async function admitLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const u = await requireUser();
    const { user } = await admitLead(u, String(fd.get("leadId")), obj(fd));
    revalidatePath("/admin/leads");
    // The lead leaves the "New" list (unmounting this form), so confirm on the Admitted view.
    target = `/admin/leads?status=ADMITTED&q=${encodeURIComponent(user.email)}&admitted=${encodeURIComponent(user.studentCode ?? "")}`;
  } catch (e) {
    return actionError(e);
  }
  redirect(target);
}

export async function leadStatusAction(fd: FormData) {
  const u = await requireUser();
  await setLeadStatus(u, String(fd.get("leadId")), String(fd.get("status")) as "CONTACTED" | "REJECTED");
  revalidatePath("/admin/leads");
}

// ── Internships & teams ─────────────────────────────────────────────

export async function createInternshipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    if (!u.can("internships:manage")) throw forbidden();
    const input = internshipInput.parse(obj(fd));
    await db.internship.create({
      data: { name: input.name, track: input.track, startDate: parseLocalDateTime(input.startDate), endDate: parseLocalDateTime(input.endDate) },
    });
    revalidatePath("/admin/internships");
    return { ok: true, message: "Internship batch created" };
  } catch (e) {
    return actionError(e);
  }
}

export async function allocateTeamsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const created = await allocateTeams(u, { internshipId: fd.get("internshipId"), teamSize: fd.get("teamSize"), mentorIds: fd.getAll("mentorIds") });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Formed ${created.length} team(s): ${created.map((t) => `${t.name} (${t.members.length}, ${t.durationMonths}m)`).join(", ")}` };
  } catch (e) {
    return actionError(e);
  }
}

export async function enrollmentAction(fd: FormData) {
  const u = await requireUser();
  const extend = Number(fd.get("extendMonths") ?? 0);
  const status = (fd.get("status") as "ON_LEAVE" | "WITHDRAWN" | "ACTIVE" | "COMPLETED" | null) ?? undefined;
  await updateEnrollment(u, String(fd.get("enrollmentId")), { status: status || undefined, extendMonths: extend || undefined });
  revalidatePath("/admin/students");
}

export async function teamAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const op = String(fd.get("op"));
    const teamId = String(fd.get("teamId"));
    if (op === "leader") await setLeader(u, teamId, String(fd.get("userId")));
    else if (op === "mentor") await setMentor(u, teamId, String(fd.get("mentorId")) || null);
    else if (op === "move") await moveStudent(u, String(fd.get("userId")), String(fd.get("toTeamId")));
    revalidatePath(`/teams/${teamId}`);
    revalidatePath("/admin/teams");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return actionError(e);
  }
}

// ── Projects & tasks ────────────────────────────────────────────────

export async function assignTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const p = await assignTemplate(u, obj(fd));
    revalidatePath("/admin/projects");
    return { ok: true, message: `Project created — open it at /projects/${p.id}` };
  } catch (e) {
    return actionError(e);
  }
}

export async function createTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await checkRateLimit("taskWrite", u.id);
    const projectId = String(fd.get("projectId"));
    await createTask(u, projectId, { ...obj(fd), assigneeIds: fd.getAll("assigneeIds"), dependsOnIds: fd.getAll("dependsOnIds"), isTeamTask: fd.get("isTeamTask") === "on" });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Task created" };
  } catch (e) {
    return actionError(e);
  }
}

export async function taskStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await checkRateLimit("taskWrite", u.id);
    const taskId = String(fd.get("taskId"));
    await changeTaskStatus(u, taskId, String(fd.get("status")) as TaskStatus);
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/workspace");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function taskDueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const taskId = String(fd.get("taskId"));
    await updateTaskDue(u, taskId, String(fd.get("dueAt")));
    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: "Due date updated (logged in audit history)" };
  } catch (e) {
    return actionError(e);
  }
}

export async function reviewerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const taskId = String(fd.get("taskId"));
    await reassignReviewer(u, taskId, String(fd.get("reviewerId")));
    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: "Reviewer reassigned" };
  } catch (e) {
    return actionError(e);
  }
}

export async function phaseStatusAction(fd: FormData) {
  const u = await requireUser();
  await setPhaseStatus(u, String(fd.get("phaseId")), String(fd.get("status")) as "IN_PROGRESS" | "COMPLETED");
  revalidatePath(`/projects/${fd.get("projectId")}`);
}

export async function closeProjectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const projectId = String(fd.get("projectId"));
    await closeProject(u, projectId);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Project closed" };
  } catch (e) {
    return actionError(e);
  }
}

export async function submitTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await checkRateLimit("taskWrite", u.id);
    const taskId = String(fd.get("taskId"));
    const files = z.array(z.any()).parse(JSON.parse(String(fd.get("files") || "[]")));
    await submitTask(u, taskId, { note: fd.get("note"), githubUrl: fd.get("githubUrl"), linkUrl: fd.get("linkUrl"), files });
    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: "Submitted for review" };
  } catch (e) {
    return actionError(e);
  }
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await checkRateLimit("reviewWrite", u.id);
    await reviewSubmission(u, String(fd.get("submissionId")), obj(fd));
    revalidatePath(`/tasks/${fd.get("taskId")}`);
    revalidatePath("/reviews");
    return { ok: true, message: "Review recorded" };
  } catch (e) {
    return actionError(e);
  }
}

// ── Meetings ────────────────────────────────────────────────────────

export async function createMeetingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const u = await requireUser();
    await checkRateLimit("meetingCreate", u.id);
    const isRequest = fd.get("mode") === "request";
    const m = isRequest
      ? await requestMeeting(u, { ...obj(fd), proposedStart: fd.get("startsAt") })
      : await createMeeting(u, { ...obj(fd), participantIds: fd.getAll("participantIds") });
    id = m.id;
  } catch (e) {
    return actionError(e);
  }
  redirect(`/meetings/${id}`);
}

export async function meetingDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const id = String(fd.get("meetingId"));
    await decideRequest(u, id, { ...obj(fd), approve: fd.get("approve") === "1" });
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: fd.get("approve") === "1" ? "Approved and invitations sent" : "Request declined" };
  } catch (e) {
    return actionError(e);
  }
}

export async function rescheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const id = String(fd.get("meetingId"));
    await reschedule(u, id, String(fd.get("startsAt")));
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: "Rescheduled — old reminders cancelled, new ones queued" };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelMeetingAction(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("meetingId"));
  await cancelMeeting(u, id);
  revalidatePath(`/meetings/${id}`);
}

export async function rsvpAction(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("meetingId"));
  await rsvp(u, id, String(fd.get("rsvp")) as Rsvp);
  revalidatePath(`/meetings/${id}`);
  revalidatePath("/workspace");
}

export async function completeMeetingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const id = String(fd.get("meetingId"));
    const titles = fd.getAll("fuTitle").map(String);
    const owners = fd.getAll("fuOwner").map(String);
    const dues = fd.getAll("fuDue").map(String);
    const followUps = titles.map((title, i) => ({ title, assigneeId: owners[i], dueAt: dues[i] })).filter((f) => f.title.trim());
    await completeMeeting(u, id, { notes: fd.get("notes"), decisions: fd.get("decisions"), attendeeIds: fd.getAll("attendeeIds"), followUps });
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: "Minutes saved and follow-up tasks created" };
  } catch (e) {
    return actionError(e);
  }
}

export async function presentationMaterialsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await updatePresentationMaterials(u, String(fd.get("presentationId")), obj(fd));
    revalidatePath(`/meetings/${fd.get("meetingId")}`);
    return { ok: true, message: "Materials saved" };
  } catch (e) {
    return actionError(e);
  }
}

export async function evaluatePresentationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const approve = fd.get("approve");
    await evaluatePresentation(u, String(fd.get("presentationId")), { ...obj(fd), approve: approve === null ? undefined : approve === "1" });
    revalidatePath(`/meetings/${fd.get("meetingId")}`);
    return { ok: true, message: "Evaluation saved" };
  } catch (e) {
    return actionError(e);
  }
}

// ── Notifications ───────────────────────────────────────────────────

export async function markAllReadAction() {
  const u = await requireUser();
  await markNotificationsRead(u);
  revalidatePath("/notifications");
}
