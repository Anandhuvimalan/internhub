import Link from "next/link";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { enrollmentAction } from "@/app/actions";

export const metadata = { title: "Students" };

export default async function Students(props: PageProps<"/admin/students">) {
  const sp = await props.searchParams;
  const u = await pageUser("students:read");
  const q = sp.q ? String(sp.q).trim() : "";
  const take = 50;
  const page = Math.max(1, Number(sp.page ?? 1));
  const enrollments = await db.enrollment.findMany({
    where: q
      ? { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { studentCode: { contains: q, mode: "insensitive" } }] } }
      : {},
    include: {
      internship: { select: { name: true } },
      user: { select: { id: true, name: true, email: true, studentCode: true, status: true, teamMemberships: { where: { leftAt: null }, select: { team: { select: { id: true, name: true } } } } } },
    },
    orderBy: [{ status: "asc" }, { user: { name: "asc" } }],
    take: take + 1,
    skip: (page - 1) * take,
  });
  const hasMore = enrollments.length > take;
  const manage = u.can("internships:manage");

  return (
    <>
      <PageHeader eyebrow="People" title="Students" subtitle="Enrollment status covers real-world exceptions: leave, extension, withdrawal, completion." />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Search by name, email or student ID" className="input max-w-sm" />
      </form>
      {enrollments.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Batch</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
                <th className="px-4 py-2.5 font-medium">Team</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                {manage && <th className="px-4 py-2.5 font-medium">Change</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {enrollments.slice(0, take).map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/performance?user=${e.user.id}`} className="font-medium hover:text-accent">{e.user.name}</Link>
                    <div className="text-xs text-muted">
                      <span className="font-mono">{e.user.studentCode}</span> · {e.user.email} {e.user.status === "INVITED" && "· not activated"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{e.internship.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {e.durationMonths} mo <div className="text-xs text-muted">ends {fmtDate(e.endDate)}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {e.user.teamMemberships[0] ? <Link href={`/teams/${e.user.teamMemberships[0].team.id}`} className="link">{e.user.teamMemberships[0].team.name}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                  {manage && (
                    <td className="px-4 py-2.5">
                      <form action={enrollmentAction} className="flex gap-1">
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <select aria-label={`Enrollment status for ${e.user.name}`} name="status" className="input w-auto py-1 text-xs" defaultValue="">
                          <option value="">—</option>
                          <option value="ACTIVE">Active</option>
                          <option value="ON_LEAVE">On leave</option>
                          <option value="WITHDRAWN">Withdrawn</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                        <select aria-label={`Extend enrollment for ${e.user.name}`} name="extendMonths" className="input w-auto py-1 text-xs" defaultValue="0">
                          <option value="0">No ext.</option>
                          <option value="1">+1 mo</option>
                          <option value="2">+2 mo</option>
                        </select>
                        <button className="btn-ghost px-2 py-1 text-xs">Apply</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No students found" />
      )}
      <div className="mt-4 flex gap-3 text-sm">
        {page > 1 && <Link className="link" href={`?q=${q}&page=${page - 1}`}>← Previous</Link>}
        {hasMore && <Link className="link" href={`?q=${q}&page=${page + 1}`}>Next →</Link>}
      </div>
    </>
  );
}
