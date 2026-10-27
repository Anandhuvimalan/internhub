import Link from "next/link";
import type { LeadStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { Empty, Field, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate, toLocalInput } from "@/lib/format";
import { admitLeadAction, leadStatusAction } from "@/app/actions";

export const metadata = { title: "Leads & Admissions" };
const FILTERS: (LeadStatus | "ALL")[] = ["NEW", "CONTACTED", "ADMITTED", "REJECTED", "ALL"];

export default async function Leads(props: PageProps<"/admin/leads">) {
  const sp = await props.searchParams;
  await pageUser("leads:read");
  const status = FILTERS.includes(String(sp.status) as LeadStatus) ? (String(sp.status) as LeadStatus | "ALL") : "NEW";
  const q = sp.q ? String(sp.q).trim() : "";
  const admitted = typeof sp.admitted === "string" && /^INT-\d{4}-\d{5}$/.test(sp.admitted) ? sp.admitted : null;
  const [leads, internships, counts] = await Promise.all([
    db.lead.findMany({
      where: {
        ...(status === "ALL" ? {} : { status }),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { convertedUser: { select: { studentCode: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.internship.findMany({ where: { isActive: true }, orderBy: { startDate: "desc" } }),
    db.lead.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => (s === "ALL" ? counts.reduce((a, c) => a + c._count, 0) : counts.find((c) => c.status === s)?._count ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title="Leads & Admissions"
        subtitle="Enquiries stay leads until approved. Approval generates the student ID, enrolls the student and queues the welcome email."
      />
      {admitted && (
        <p role="status" className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">
          Admitted as <span className="font-mono font-semibold">{admitted}</span>. The activation email has been queued.
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-4 border-b border-line">
          {FILTERS.map((f) => (
            <Link key={f} href={`?status=${f}`} className={`tab ${status === f ? "tab-active" : ""}`}>
              {f === "ALL" ? "All" : f[0] + f.slice(1).toLowerCase()} <span className="text-xs text-muted">{count(f)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search name or email" className="input w-56" />
        </form>
      </div>

      {leads.length ? (
        <div className="space-y-3">
          {leads.map((l) => (
            <div key={l.id} className="card card-pad">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{l.name}</span>
                    <StatusBadge status={l.status} />
                    {l.convertedUser?.studentCode && <span className="font-mono text-xs text-muted">{l.convertedUser.studentCode}</span>}
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {l.email} {l.phone && `· ${l.phone}`} · {l.course ?? "No track"} · {l.preferredDuration ? `${l.preferredDuration} month(s)` : "duration open"} · {fmtDate(l.createdAt)} via {l.source}
                  </div>
                  {l.message && <p className="mt-2 text-sm text-ink-2">“{l.message}”</p>}
                  {l.notes && <p className="mt-1 text-xs text-muted">Note: {l.notes}</p>}
                </div>
                {l.status !== "ADMITTED" && l.status !== "REJECTED" && (
                  <form action={leadStatusAction} className="flex gap-2">
                    <input type="hidden" name="leadId" value={l.id} />
                    {l.status === "NEW" && <button name="status" value="CONTACTED" className="btn-ghost text-xs">Mark contacted</button>}
                    <button name="status" value="REJECTED" className="btn-ghost text-xs text-danger">Reject</button>
                  </form>
                )}
              </div>
              {l.status !== "ADMITTED" && l.status !== "REJECTED" && (
                <details className="mt-3 rounded-lg bg-surface-2 px-4 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-accent">Approve admission</summary>
                  {internships.length ? (
                    <ActionForm action={admitLeadAction} className="mt-3 grid grid-cols-1 items-end gap-3 pb-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                      <input type="hidden" name="leadId" value={l.id} />
                      <Field label="Internship batch">
                        <select name="internshipId" className="input" defaultValue={internships.find((i) => i.track === l.course)?.id ?? internships[0].id}>
                          {internships.map((i) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Duration">
                        <select name="durationMonths" className="input" defaultValue={String(l.preferredDuration ?? 3)}>
                          {[1, 2, 3, 4].map((m) => (
                            <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Start date">
                        <input name="startDate" type="date" required className="input" defaultValue={toLocalInput(new Date()).slice(0, 10)} />
                      </Field>
                      <SubmitButton>Admit</SubmitButton>
                    </ActionForm>
                  ) : (
                    <p className="py-2 text-sm text-muted">Create an internship batch first.</p>
                  )}
                </details>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No leads here">New enquiries from the website form appear under “New”.</Empty>
      )}
    </>
  );
}
