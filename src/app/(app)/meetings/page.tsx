import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { accessibleTeamIds } from "@/server/access";
import { MEETING_LABEL } from "@/server/services/meetings";
import { Badge, Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Meetings" };

export default async function Meetings() {
  const u = await pageUser();
  const teams = await accessibleTeamIds(u);
  const scope: Prisma.MeetingWhereInput = teams === null ? {} : { OR: [{ teamId: { in: teams } }, { participants: { some: { userId: u.id } } }, { organizerId: u.id }] };
  const now = new Date();
  const include = { team: { select: { name: true } }, participants: { where: { userId: u.id } } } as const;

  const [upcoming, waiting, history] = await Promise.all([
    db.meeting.findMany({ where: { ...scope, status: "SCHEDULED", startsAt: { gte: new Date(now.getTime() - 3_600_000) } }, include, orderBy: { startsAt: "asc" }, take: 50 }),
    db.meeting.findMany({
      where: {
        AND: [
          scope,
          { OR: [{ status: "REQUESTED" }, { status: "SCHEDULED", startsAt: { gte: now }, participants: { some: { userId: u.id, rsvp: "PENDING" } } }, { status: "SCHEDULED", startsAt: { lt: now } }] },
        ],
      },
      include,
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
    db.meeting.findMany({ where: { ...scope, status: { in: ["COMPLETED", "CANCELLED", "REJECTED"] } }, include, orderBy: { startsAt: "desc" }, take: 30 }),
  ]);

  const row = (m: (typeof upcoming)[number], why?: string) => (
    <li key={m.id}>
      <Link href={`/meetings/${m.id}`} className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{m.title}</div>
          <div className="text-xs text-muted">
            {MEETING_LABEL[m.type]} {m.team && `· Team ${m.team.name}`} · {fmtDateTime(m.startsAt)} IST
          </div>
        </div>
        {why && <Badge tone="warn">{why}</Badge>}
        <StatusBadge status={m.status} />
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        eyebrow="Scheduling"
        title="Meetings & Presentations"
        actions={
          <Link href="/meetings/new" className="btn-primary">
            New meeting
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Waiting for action">
          {waiting.length ? (
            <ul>
              {waiting.map((m) =>
                row(m, m.status === "REQUESTED" ? (u.can("meetings:approve") ? "Needs approval" : "Awaiting approval") : m.startsAt < now ? "Add minutes" : "RSVP"),
              )}
            </ul>
          ) : (
            <Empty title="Nothing waiting on you" />
          )}
        </Card>
        <Card title="Upcoming">{upcoming.length ? <ul>{upcoming.map((m) => row(m))}</ul> : <Empty title="No upcoming meetings" />}</Card>
        <Card title="History" className="lg:col-span-2">
          {history.length ? <ul>{history.map((m) => row(m))}</ul> : <Empty title="No past meetings yet" />}
        </Card>
      </div>
    </>
  );
}
