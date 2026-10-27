import Link from "next/link";
import { db } from "@/lib/db";
import { guarded, pageUser } from "@/server/page-guard";
import { getTaskDetail } from "@/server/services/reviews";
import { canSuperviseTeam } from "@/server/access";
import { storageConfigured } from "@/lib/storage";
import { Badge, Card, Empty, Field, OverdueBadge, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { SubmissionForm } from "@/components/submission-form";
import { fmtDate, fmtDateTime, isOverdue, toLocalInput } from "@/lib/format";
import { reviewAction, reviewerAction, taskDueAction, taskStatusAction } from "@/app/actions";

export default async function TaskPage(props: PageProps<"/tasks/[id]">) {
  const { id } = await props.params;
  const u = await pageUser();
  const t = await guarded(() => getTaskDetail(u, id));
  const teamId = t.project.teamId;
  const supervisor = await canSuperviseTeam(u, teamId);
  const isMember = t.project.team.members.some((m) => m.userId === u.id);
  const isAssignee = t.assignees.some((a) => a.userId === u.id) || (t.isTeamTask && isMember);
  const canSubmit = isAssignee && u.can("submissions:create") && ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(t.status);
  const latest = t.submissions[0];
  const canReview =
    t.status === "IN_REVIEW" && latest && u.can("reviews:perform") && !isMember && latest.submittedById !== u.id && (t.reviewerId === u.id || t.project.team.mentorId === u.id || u.isStaff);

  const reviewers = u.can("reviews:assign")
    ? await db.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { in: ["REVIEWER", "MENTOR"] } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  const studentMoves: Record<string, { to: string; label: string }[]> = {
    BACKLOG: [{ to: "TODO", label: "Move to To Do" }],
    TODO: [{ to: "IN_PROGRESS", label: "Start working" }],
    IN_PROGRESS: [{ to: "TODO", label: "Back to To Do" }],
    CHANGES_REQUESTED: [{ to: "IN_PROGRESS", label: "Start rework" }],
  };
  const moves = isAssignee ? studentMoves[t.status] ?? [] : supervisor && t.status !== "APPROVED" && t.status !== "IN_REVIEW" ? [{ to: "TODO", label: "To Do" }, { to: "IN_PROGRESS", label: "In Progress" }, { to: "BACKLOG", label: "Backlog" }].filter((m) => m.to !== t.status) : [];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/projects/${t.projectId}`} className="hover:text-accent">
            {t.project.title} {t.phase ? `· Phase ${t.phase.order}: ${t.phase.title}` : ""}
          </Link>
        }
        title={t.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            {isOverdue(t) && <OverdueBadge />}
            <StatusBadge status={t.priority} />
            {t.isTeamTask && <Badge>Team task</Badge>}
            {t.sourceMeeting && (
              <Link href={`/meetings/${t.sourceMeeting.id}`} className="text-xs link">
                from {t.sourceMeeting.title}
              </Link>
            )}
          </span>
        }
        actions={moves.map((m) => (
          <ActionForm key={m.to} action={taskStatusAction} className="">
            <input type="hidden" name="taskId" value={t.id} />
            <input type="hidden" name="status" value={m.to} />
            <SubmitButton variant={m.to === "IN_PROGRESS" ? "primary" : "ghost"}>{m.label}</SubmitButton>
          </ActionForm>
        ))}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Details">
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Info label="Assigned to" value={t.isTeamTask ? `Team ${t.project.team.name}` : t.assignees.map((a) => a.user.name).join(", ") || "—"} />
              <Info label="Reviewer" value={t.reviewer?.name ?? "Auto-assigned on submission"} />
              <Info label="Start / Due" value={`${fmtDate(t.startAt)} → ${fmtDate(t.dueAt)}`} />
              <Info label="Completed" value={t.completedAt ? `${fmtDate(t.completedAt)}${t.dueAt ? (t.completedAt <= t.dueAt ? " · on time" : " · late") : ""}` : "—"} />
              <Info label="Deliverables" value={t.deliverables ?? "—"} />
              <Info label="Dependencies" value={t.dependsOn.length ? t.dependsOn.map((d) => `${d.dependsOn.title} (${d.dependsOn.status.toLowerCase().replace("_", " ")})`).join(", ") : "None"} />
            </dl>
            {t.acceptanceCriteria && (
              <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
                <div className="eyebrow mb-1">Acceptance criteria</div>
                {t.acceptanceCriteria}
              </div>
            )}
            {t.description && <p className="mt-4 whitespace-pre-wrap text-sm text-ink-2">{t.description}</p>}
          </Card>

          <Card title="Submissions & reviews" action={<span className="text-xs text-muted">full history kept</span>}>
            {t.submissions.length ? (
              <ol className="space-y-5">
                {t.submissions.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        Version {s.version} <span className="font-normal text-muted">by {s.submittedBy.name}</span>
                      </span>
                      <span className="text-xs text-muted">{fmtDateTime(s.createdAt)}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {s.githubUrl && <a href={s.githubUrl} target="_blank" rel="noreferrer" className="link block truncate">⌥ {s.githubUrl}</a>}
                      {s.linkUrl && <a href={s.linkUrl} target="_blank" rel="noreferrer" className="link block truncate">↗ {s.linkUrl}</a>}
                      {s.files.map((f) => (
                        <a key={f.id} href={`/api/v1/files/${f.id}`} className="link block">📎 {f.fileName}</a>
                      ))}
                      {s.note && <p className="text-ink-2">{s.note}</p>}
                    </div>
                    {s.reviews.map((r) => (
                      <div key={r.id} className={`mt-3 rounded-md border-l-2 p-3 text-sm ${r.decision === "APPROVED" ? "border-ok bg-ok-soft/50" : "border-danger bg-danger-soft/50"}`}>
                        <div className="flex items-center justify-between">
                          <StatusBadge status={r.decision} />
                          <span className="text-xs text-muted">
                            {r.reviewer.name} · {fmtDateTime(r.createdAt)} {r.score != null && `· ${r.score}/100`}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap">{r.feedback}</p>
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty title="Nothing submitted yet" />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {canSubmit && (
            <Card title={t.status === "CHANGES_REQUESTED" ? "Resubmit" : "Submit work"}>
              <SubmissionForm taskId={t.id} storageEnabled={storageConfigured()} resubmission={t.submissions.length > 0} />
            </Card>
          )}

          {canReview && (
            <Card title={`Review v${latest.version}`}>
              <ActionForm action={reviewAction}>
                <input type="hidden" name="submissionId" value={latest.id} />
                <input type="hidden" name="taskId" value={t.id} />
                <Field label="Feedback">
                  <textarea name="feedback" rows={5} required className="input" placeholder="What works, what must change…" />
                </Field>
                <Field label="Quality score (0–100)">
                  <input name="score" type="number" min={0} max={100} className="input" />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="APPROVED">Approve</SubmitButton>
                  <SubmitButton name="decision" value="CHANGES_REQUESTED" variant="danger">
                    Request changes
                  </SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          {supervisor && t.status !== "APPROVED" && (
            <Card title="Mentor tools">
              <ActionForm action={taskDueAction}>
                <input type="hidden" name="taskId" value={t.id} />
                <Field label="Due date" hint="Changes are audit-logged and the team is notified">
                  <input name="dueAt" type="datetime-local" required className="input" defaultValue={t.dueAt ? toLocalInput(t.dueAt) : ""} />
                </Field>
                <SubmitButton variant="ghost">Update due date</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {u.can("reviews:assign") && t.status !== "APPROVED" && (
            <Card title="Reviewer assignment">
              <ActionForm action={reviewerAction}>
                <input type="hidden" name="taskId" value={t.id} />
                <select name="reviewerId" className="input" defaultValue={t.reviewerId ?? ""}>
                  <option value="" disabled>
                    Choose reviewer
                  </option>
                  {reviewers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="ghost">Reassign</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
