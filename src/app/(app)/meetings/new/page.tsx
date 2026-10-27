import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { accessibleTeamIds, mentoredTeamIds } from "@/server/access";
import { Card, PageHeader } from "@/components/ui";
import { MeetingForm } from "@/components/meeting-form";

export const metadata = { title: "New meeting" };

export default async function NewMeeting(props: PageProps<"/meetings/new">) {
  const sp = await props.searchParams;
  const u = await pageUser();
  const ids = await accessibleTeamIds(u);
  const teams = await db.team.findMany({
    where: ids === null ? {} : { id: { in: ids } },
    select: {
      id: true,
      name: true,
      projects: { where: { status: "ACTIVE" }, select: { id: true, title: true, phases: { select: { id: true, order: true, title: true }, orderBy: { order: "asc" } } } },
    },
    orderBy: { name: "asc" },
  });

  // Mirror the service rules so the form only offers what will succeed.
  const mentored = await mentoredTeamIds(u.id);
  const leader = u.leaderTeamIds.length > 0;
  const supervisor = u.isStaff || mentored.length > 0;
  const schedulable: string[] = [];
  if (supervisor || leader) schedulable.push("TEAM_MEETING", "MENTOR_REVIEW", "PHASE_PRESENTATION");
  if (u.isStaff) schedulable.push("ADMIN_HEAD_REVIEW");
  if (u.isStaff || (mentored.length && u.can("meetings:schedule_official"))) schedulable.push("FINAL_PRESENTATION");
  const requestable = u.can("meetings:request") ? ["ADMIN_HEAD_REVIEW", "MENTOR_REVIEW"] : [];

  return (
    <>
      <PageHeader eyebrow="Scheduling" title="Plan a meeting" subtitle="Invitations, reminders (1 day and 1 hour before) and RSVPs are handled automatically." />
      <Card className="max-w-3xl">
        <MeetingForm teams={teams} schedulable={schedulable} requestable={requestable} defaults={{ teamId: sp.team ? String(sp.team) : undefined, projectId: sp.project ? String(sp.project) : undefined }} />
      </Card>
    </>
  );
}
