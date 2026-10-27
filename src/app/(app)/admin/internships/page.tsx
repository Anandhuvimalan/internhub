import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { allocateTeamsAction, createInternshipAction } from "@/app/actions";

export const metadata = { title: "Internships" };

export default async function Internships() {
  await pageUser("internships:manage");
  const [internships, mentors] = await Promise.all([
    db.internship.findMany({
      orderBy: { startDate: "desc" },
      include: {
        _count: { select: { teams: true } },
        enrollments: { where: { status: { in: ["ACTIVE", "EXTENDED"] } }, select: { durationMonths: true, user: { select: { teamMemberships: { where: { leftAt: null }, select: { team: { select: { internshipId: true } } } } } } } },
      },
    }),
    db.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: "MENTOR" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Programs" title="Internships & team allocation" subtitle="One engine for 1–4 month interns. Each enrollment keeps its own dates; teams are balanced within compatible durations." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {internships.length ? (
            internships.map((i) => {
              const unallocated = i.enrollments.filter((e) => !e.user.teamMemberships.some((m) => m.team.internshipId === i.id));
              const byDuration = [1, 2, 3, 4].map((d) => ({ d, n: i.enrollments.filter((e) => e.durationMonths === d).length })).filter((x) => x.n);
              return (
                <div key={i.id} className="card card-pad">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{i.name}</div>
                      <div className="text-sm text-muted">
                        {i.track} · {fmtDate(i.startDate)} → {fmtDate(i.endDate)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge tone="accent">{i.enrollments.length} active</Badge>
                      <Badge>{i._count.teams} teams</Badge>
                      {unallocated.length > 0 && <Badge tone="warn">{unallocated.length} without team</Badge>}
                    </div>
                  </div>
                  {byDuration.length > 0 && (
                    <div className="mt-2 text-xs text-muted">By duration: {byDuration.map((x) => `${x.d}m × ${x.n}`).join(" · ")}</div>
                  )}
                  {unallocated.length >= 2 && (
                    <details className="mt-3 rounded-lg bg-surface-2 px-4 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-accent">Allocate {unallocated.length} students into balanced teams</summary>
                      <ActionForm action={allocateTeamsAction} className="mt-3 space-y-3 pb-2">
                        <input type="hidden" name="internshipId" value={i.id} />
                        <Field label="Target team size" hint="Sizes differ by at most one; students are grouped with others of the same duration.">
                          <input name="teamSize" type="number" min={2} max={12} defaultValue={5} className="input w-28" />
                        </Field>
                        <div>
                          <span className="label">Mentors (assigned round-robin)</span>
                          <div className="flex flex-wrap gap-3">
                            {mentors.map((m) => (
                              <label key={m.id} className="flex items-center gap-1.5 text-sm">
                                <input type="checkbox" name="mentorIds" value={m.id} defaultChecked /> {m.name}
                              </label>
                            ))}
                          </div>
                        </div>
                        <SubmitButton pendingLabel="Allocating…">Allocate teams</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </div>
              );
            })
          ) : (
            <Empty title="No internship batches yet" />
          )}
        </div>

        <Card title="New internship batch">
          <ActionForm action={createInternshipAction} resetOnSuccess>
            <Field label="Name">
              <input name="name" required className="input" placeholder="Data Analytics Internship — Jan 2027" />
            </Field>
            <Field label="Track">
              <input name="track" required className="input" placeholder="Data Analytics" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input name="startDate" type="date" required className="input" />
              </Field>
              <Field label="Ends">
                <input name="endDate" type="date" required className="input" />
              </Field>
            </div>
            <SubmitButton>Create batch</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
