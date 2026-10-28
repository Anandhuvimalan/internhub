import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { canAccessTeam, canSuperviseTeam } from "@/server/access";
import { MEETING_LABEL } from "@/server/services/meetings";
import { Avatar, Badge, Card, Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime, PRESENTATION_WEIGHTS, toLocalInput, type PresentationScores } from "@/lib/format";
import {
  cancelMeetingAction,
  completeMeetingAction,
  evaluatePresentationAction,
  meetingDecisionAction,
  presentationMaterialsAction,
  rescheduleAction,
  rsvpAction,
} from "@/app/actions";

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const { id } = await props.params;
  const u = await pageUser();
  const m = await db.meeting.findUnique({
    where: { id },
    include: {
      team: { include: { members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true } } } } } },
      project: { select: { id: true, title: true } },
      phase: { select: { title: true, order: true } },
      organizer: { select: { name: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
      minutes: { include: { createdBy: { select: { name: true } } } },
      followUpTasks: { select: { id: true, title: true, status: true } },
      presentation: { include: { reviews: { include: { reviewer: { select: { name: true } }, student: { select: { name: true } } }, orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!m) notFound();
  const isParticipant = m.participants.some((p) => p.userId === u.id);
  const teamAccess = m.teamId ? await canAccessTeam(u, m.teamId) : u.isStaff;
  const supervisor = m.teamId ? await canSuperviseTeam(u, m.teamId) : u.isStaff;
  if (!(isParticipant || teamAccess || m.organizerId === u.id || u.isStaff)) notFound();

  const me = m.participants.find((p) => p.userId === u.id);
  const canManage = m.organizerId === u.id || supervisor || u.isStaff;
  const canDecide = m.status === "REQUESTED" && (m.type === "MENTOR_REVIEW" ? u.isStaff || m.team?.mentorId === u.id : u.can("meetings:approve"));
  const isTeamMember = m.team?.members.some((x) => x.userId === u.id) ?? false;
  const canEvaluate = m.presentation && u.can("presentations:evaluate") && !isTeamMember;

  return (
    <>
      <PageHeader
        eyebrow={`${MEETING_LABEL[m.type]}${m.team ? ` · Team ${m.team.name}` : ""}`}
        title={m.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.status} />
            <span>
              {fmtDateTime(m.startsAt)} IST{m.status === "REQUESTED" && " (proposed)"} · organized by {m.organizer.name}
            </span>
          </span>
        }
        actions={
          m.meetingUrl && m.status === "SCHEDULED" ? (
            <a href={m.meetingUrl} target="_blank" rel="noreferrer" className="btn-primary">
              Join meeting
            </a>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Details">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Project</dt>
                <dd>{m.project ? <Link href={`/projects/${m.project.id}`} className="link">{m.project.title}</Link> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Phase</dt>
                <dd>{m.phase ? `${m.phase.order}. ${m.phase.title}` : "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Agenda</dt>
                <dd className="whitespace-pre-wrap">{m.agenda ?? "—"}</dd>
              </div>
              {m.expectedDeliverables && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Expected deliverables</dt>
                  <dd>{m.expectedDeliverables}</dd>
                </div>
              )}
              {m.decisionNote && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Approver note</dt>
                  <dd>{m.decisionNote}</dd>
                </div>
              )}
            </dl>
          </Card>

          {m.presentation && (
            <Card title="Presentation" action={m.presentation.approved != null && <StatusBadge status={m.presentation.approved ? "APPROVED" : "CHANGES_REQUESTED"} />}>
              <div className="space-y-1 text-sm">
                <div>Slides: {m.presentation.slidesUrl ? <a className="link" href={m.presentation.slidesUrl} target="_blank" rel="noreferrer">{m.presentation.slidesUrl}</a> : <Badge tone="warn">Not uploaded</Badge>}</div>
                <div>Demo: {m.presentation.demoUrl ? <a className="link" href={m.presentation.demoUrl} target="_blank" rel="noreferrer">{m.presentation.demoUrl}</a> : "—"}</div>
              </div>
              {(isTeamMember || supervisor) && m.status !== "COMPLETED" && (
                <ActionForm action={presentationMaterialsAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <input type="hidden" name="presentationId" value={m.presentation.id} />
                  <input type="hidden" name="meetingId" value={m.id} />
                  <Field label="Slides link">
                    <input name="slidesUrl" type="url" className="input" defaultValue={m.presentation.slidesUrl ?? ""} />
                  </Field>
                  <Field label="Demo link">
                    <input name="demoUrl" type="url" className="input" defaultValue={m.presentation.demoUrl ?? ""} />
                  </Field>
                  <SubmitButton variant="ghost">Save</SubmitButton>
                </ActionForm>
              )}

              <div className="mt-5">
                <div className="eyebrow mb-2">Evaluations</div>
                {m.presentation.reviews.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {m.presentation.reviews.map((r) => {
                      const s = r.scores as PresentationScores;
                      return (
                        <li key={r.id} className="py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{r.student ? r.student.name : "Team score"}</span>
                            <span className="tabular-nums font-semibold">{r.total}/100</span>
                          </div>
                          <div className="text-xs text-muted">
                            {Object.keys(PRESENTATION_WEIGHTS).map((k) => `${k} ${s[k as keyof PresentationScores]}`).join(" · ")} — {r.reviewer.name}
                          </div>
                          {r.feedback && <p className="mt-1 text-ink-2">{r.feedback}</p>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Empty title="Not evaluated yet" />
                )}
              </div>
            </Card>
          )}

          {m.minutes ? (
            <Card title="Minutes" action={<span className="text-xs text-muted">by {m.minutes.createdBy.name}</span>}>
              <p className="whitespace-pre-wrap text-sm">{m.minutes.notes}</p>
              {m.minutes.decisions && (
                <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="eyebrow mb-1">Decisions</div>
                  <p className="whitespace-pre-wrap">{m.minutes.decisions}</p>
                </div>
              )}
              {m.followUpTasks.length > 0 && (
                <div className="mt-4">
                  <div className="eyebrow mb-2">Follow-up tasks</div>
                  <ul className="space-y-1 text-sm">
                    {m.followUpTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between">
                        <Link href={`/tasks/${t.id}`} className="link">{t.title}</Link>
                        <StatusBadge status={t.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ) : (
            canManage &&
            m.status === "SCHEDULED" && (
              <Card title="Complete meeting — minutes, attendance & follow-ups">
                <ActionForm action={completeMeetingAction}>
                  <input type="hidden" name="meetingId" value={m.id} />
                  <Field label="Minutes / discussion notes">
                    <textarea name="notes" rows={4} required className="input" />
                  </Field>
                  <Field label="Decisions">
                    <textarea name="decisions" rows={2} className="input" />
                  </Field>
                  <div>
                    <span className="label">Attendance</span>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {m.participants.map((p) => (
                        <label key={p.userId} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="attendeeIds" value={p.userId} defaultChecked={p.rsvp !== "DECLINED"} /> {p.user.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  {m.projectId && (
                    <div>
                      <span className="label">Follow-up tasks (added to the project)</span>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                          <input aria-label={`Follow-up task ${i + 1} title`} name="fuTitle" className="input" placeholder={`Action item ${i + 1}`} />
                          <select aria-label={`Follow-up task ${i + 1} owner`} name="fuOwner" className="input">
                            {m.team?.members.map((x) => (
                              <option key={x.userId} value={x.userId}>{x.user.name}</option>
                            ))}
                          </select>
                          <input aria-label={`Follow-up task ${i + 1} due date`} name="fuDue" type="date" className="input" />
                        </div>
                      ))}
                    </div>
                  )}
                  <SubmitButton>Save minutes & complete</SubmitButton>
                </ActionForm>
              </Card>
            )
          )}
        </div>

        <div className="space-y-6">
          {me && m.status === "SCHEDULED" && m.startsAt > new Date() && (
            <Card title="Your RSVP" action={<StatusBadge status={me.rsvp} />}>
              <form action={rsvpAction} className="flex gap-2">
                <input type="hidden" name="meetingId" value={m.id} />
                <button name="rsvp" value="ACCEPTED" className={me.rsvp === "ACCEPTED" ? "btn-primary" : "btn-ghost"}>Accept</button>
                <button name="rsvp" value="DECLINED" className={me.rsvp === "DECLINED" ? "btn-danger" : "btn-ghost"}>Decline</button>
              </form>
            </Card>
          )}

          {canDecide && (
            <Card title="Approve request">
              <ActionForm action={meetingDecisionAction}>
                <input type="hidden" name="meetingId" value={m.id} />
                <Field label="Confirmed time (IST)">
                  <input name="startsAt" type="datetime-local" className="input" defaultValue={toLocalInput(m.startsAt)} />
                </Field>
                <Field label="Meeting link">
                  <input name="meetingUrl" type="url" className="input" placeholder="https://meet.google.com/…" />
                </Field>
                <Field label="Note to team">
                  <input name="note" className="input" />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton name="approve" value="1">Approve</SubmitButton>
                  <SubmitButton name="approve" value="0" variant="danger">Decline</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          {canEvaluate && m.presentation && (
            <Card title="Evaluate presentation">
              <ActionForm action={evaluatePresentationAction} resetOnSuccess>
                <input type="hidden" name="presentationId" value={m.presentation.id} />
                <input type="hidden" name="meetingId" value={m.id} />
                <Field label="Who">
                  <select name="studentId" className="input">
                    <option value="">Whole team</option>
                    {m.team?.members.map((x) => (
                      <option key={x.userId} value={x.userId}>{x.user.name} (individual)</option>
                    ))}
                  </select>
                </Field>
                {(
                  [
                    ["technical", "Technical understanding"],
                    ["implementation", "Project implementation"],
                    ["communication", "Explanation & communication"],
                    ["contribution", "Team contribution"],
                    ["qa", "Questions & answers"],
                  ] as const
                ).map(([k, l]) => (
                  <Field key={k} label={`${l} · ${PRESENTATION_WEIGHTS[k] * 100}%`}>
                    <input name={k} type="number" min={0} max={100} required className="input" />
                  </Field>
                ))}
                <Field label="Feedback">
                  <textarea name="feedback" rows={3} className="input" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>Save score</SubmitButton>
                  <SubmitButton name="approve" value="1" variant="ghost">Save & sign off</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          <Card title={`Participants (${m.participants.length})`}>
            {m.participants.length ? (
              <ul className="space-y-2 text-sm">
                {m.participants.map((p) => (
                  <li key={p.userId} className="flex items-center gap-2">
                    <Avatar name={p.user.name} size={24} />
                    <span className="flex-1">{p.user.name}</span>
                    {p.attended != null ? <Badge tone={p.attended ? "ok" : "danger"}>{p.attended ? "Attended" : "Absent"}</Badge> : <StatusBadge status={p.rsvp} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Invitations go out once the request is approved.</p>
            )}
          </Card>

          {canManage && m.status === "SCHEDULED" && (
            <Card title="Reschedule or cancel">
              <ActionForm action={rescheduleAction}>
                <input type="hidden" name="meetingId" value={m.id} />
                <Field label="New meeting time (IST)"><input name="startsAt" type="datetime-local" required className="input" defaultValue={toLocalInput(m.startsAt)} /></Field>
                <SubmitButton variant="ghost">Reschedule</SubmitButton>
              </ActionForm>
              <form action={cancelMeetingAction} className="mt-3">
                <input type="hidden" name="meetingId" value={m.id} />
                <button className="btn-danger w-full">Cancel meeting</button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
