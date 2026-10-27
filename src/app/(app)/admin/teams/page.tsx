import Link from "next/link";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { Avatar, Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Teams" };

export default async function Teams() {
  await pageUser("teams:manage");
  const teams = await db.team.findMany({
    include: {
      internship: { select: { name: true } },
      mentor: { select: { name: true } },
      members: { where: { leftAt: null }, include: { user: { select: { name: true } } } },
      projects: { where: { status: "ACTIVE" }, select: { title: true } },
    },
    orderBy: [{ internshipId: "asc" }, { name: "asc" }],
  });
  return (
    <>
      <PageHeader eyebrow="Organization" title="Teams" subtitle="Open a team to change its leader or mentor, or move a student. Membership history is kept." />
      {teams.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="card card-pad block hover:border-accent/50">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">Team {t.name}</span>
                <Badge>{t.members.length} members</Badge>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted">{t.internship.name}</div>
              <div className="mt-3 flex -space-x-1.5">
                {t.members.map((m) => (
                  <Avatar key={m.id} name={m.user.name} size={26} />
                ))}
              </div>
              <div className="mt-3 text-sm text-ink-2">Mentor: {t.mentor?.name ?? <span className="text-warn">unassigned</span>}</div>
              <div className="truncate text-sm text-muted">{t.projects.map((p) => p.title).join(", ") || "No active project"}</div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No teams yet">Allocate students from the Internships page.</Empty>
      )}
    </>
  );
}
