import Link from "next/link";
import { db } from "@/lib/db";
import { guarded, pageUser } from "@/server/page-guard";
import { assertTeamAccess } from "@/server/access";
import { activityFeed } from "@/server/queries";
import { Avatar, Badge, Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate, relative } from "@/lib/format";
import { teamAdminAction } from "@/app/actions";

export default async function TeamPage(props: PageProps<"/teams/[id]">) {
  const { id } = await props.params;
  const u = await pageUser();
  await guarded(() => assertTeamAccess(u, id));
  const team = await db.team.findUniqueOrThrow({
    where: { id },
    include: {
      internship: true,
      mentor: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, studentCode: true, enrollments: { where: { internshipId: undefined }, select: { durationMonths: true, endDate: true, internshipId: true } } } } }, orderBy: [{ leftAt: "asc" }, { joinedAt: "asc" }] },
      projects: { orderBy: { startDate: "desc" } },
    },
  });
  const manage = u.can("teams:manage");
  const [mentors, otherTeams, feed] = await Promise.all([
    manage ? db.user.findMany({ where: { roles: { some: { role: "MENTOR" } }, status: "ACTIVE" }, select: { id: true, name: true } }) : [],
    manage ? db.team.findMany({ where: { internshipId: team.internshipId, id: { not: id } }, select: { id: true, name: true } }) : [],
    activityFeed(u, { teamId: id, take: 15 }),
  ]);
  const active = team.members.filter((m) => !m.leftAt);
  const past = team.members.filter((m) => m.leftAt);

  return (
    <>
      <PageHeader eyebrow={team.internship.name} title={`Team ${team.name}`} subtitle={`Mentor: ${team.mentor?.name ?? "unassigned"} · ${active.length} active members`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Members">
            <ul className="divide-y divide-line">
              {active.map((m) => {
                const enr = m.user.enrollments.find((e) => e.internshipId === team.internshipId);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Avatar name={m.user.name} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {m.user.name} {m.isLeader && <Badge tone="accent">Leader</Badge>}
                      </div>
                      <div className="text-xs text-muted">
                        {m.user.studentCode} · joined {fmtDate(m.joinedAt)} {enr && `· ${enr.durationMonths}-month · ends ${fmtDate(enr.endDate)}`}
                      </div>
                    </div>
                    {(u.isStaff || team.mentorId === u.id) && (
                      <Link href={`/performance?user=${m.userId}`} className="text-xs link">Performance</Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {past.length > 0 && (
              <div className="mt-4 text-xs text-muted">
                Former members: {past.map((m) => `${m.user.name} (left ${fmtDate(m.leftAt)})`).join(", ")}
              </div>
            )}
          </Card>
          <Card title="Projects">
            {team.projects.length ? (
              <ul className="divide-y divide-line">
                {team.projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <Link href={`/projects/${p.id}`} className="link">{p.title}</Link>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No projects assigned" />
            )}
          </Card>
          <Card title="Recent activity">
            {feed.items.length ? (
              <ul className="space-y-2 text-sm">
                {feed.items.map((a) => (
                  <li key={a.id}>
                    {a.message} <span className="text-xs text-muted">· {relative(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No activity yet" />
            )}
          </Card>
        </div>

        {manage && (
          <div className="space-y-6">
            <Card title="Team leader">
              <ActionForm action={teamAdminAction}>
                <input type="hidden" name="op" value="leader" />
                <input type="hidden" name="teamId" value={id} />
                <select name="userId" className="input" defaultValue={active.find((m) => m.isLeader)?.userId}>
                  {active.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
                </select>
                <SubmitButton variant="ghost">Set leader</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Mentor">
              <ActionForm action={teamAdminAction}>
                <input type="hidden" name="op" value="mentor" />
                <input type="hidden" name="teamId" value={id} />
                <select name="mentorId" className="input" defaultValue={team.mentorId ?? ""}>
                  <option value="">Unassigned</option>
                  {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <SubmitButton variant="ghost">Change mentor</SubmitButton>
              </ActionForm>
            </Card>
            {otherTeams.length > 0 && (
              <Card title="Move a student">
                <ActionForm action={teamAdminAction}>
                  <input type="hidden" name="op" value="move" />
                  <input type="hidden" name="teamId" value={id} />
                  <select name="userId" className="input">
                    {active.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
                  </select>
                  <select name="toTeamId" className="input">
                    {otherTeams.map((t) => <option key={t.id} value={t.id}>to Team {t.name}</option>)}
                  </select>
                  <p className="text-xs text-muted">Their task, review and performance history stays with them.</p>
                  <SubmitButton variant="ghost">Move student</SubmitButton>
                </ActionForm>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
