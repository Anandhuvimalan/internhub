import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { pageUser } from "@/server/page-guard";
import { NavLink } from "@/components/nav-link";
import { Avatar } from "@/components/ui";
import { logoutAction } from "@/app/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Static shell is prerendered; everything user-specific streams in.
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">
        <div className="h-7 w-64 animate-pulse rounded bg-line/60" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  );
}

async function AppShell({ children }: { children: React.ReactNode }) {
  const u = await pageUser();
  const [unread, pendingReviews, meetingRequests] = await Promise.all([
    db.notification.count({ where: { userId: u.id, readAt: null } }),
    u.can("reviews:perform") ? db.task.count({ where: { status: "IN_REVIEW", OR: [{ reviewerId: u.id }, { project: { team: { mentorId: u.id } } }] } }) : 0,
    u.can("meetings:approve") ? db.meeting.count({ where: { status: "REQUESTED" } }) : 0,
  ]);
  const isMentor = u.roles.includes("MENTOR");
  const isStudent = u.roles.includes("STUDENT");

  const navigation = <>          {u.isStaff && (
            <>
              <div className="eyebrow px-3 pb-1 pt-2">Organization</div>
              <NavLink href="/admin">Overview</NavLink>
              <NavLink href="/admin/leads">Leads & Admissions</NavLink>
              <NavLink href="/admin/students">Students</NavLink>
              <NavLink href="/admin/internships">Internships</NavLink>
              <NavLink href="/admin/teams">Teams</NavLink>
              <NavLink href="/admin/projects">Projects</NavLink>
              <NavLink href="/admin/templates">Templates</NavLink>
              {u.can("settings:manage") && <><NavLink href="/admin/staff">Staff</NavLink><NavLink href="/admin/operations">Operations</NavLink></>}
            </>
          )}
          {isMentor && <NavLink href="/mentor">My Teams</NavLink>}
          {isStudent && (
            <>
              <div className="eyebrow px-3 pb-1 pt-2">My work</div>
              <NavLink href="/workspace">Workspace</NavLink>
              <NavLink href={`/performance`}>Performance</NavLink>
            </>
          )}
          <div className="eyebrow px-3 pb-1 pt-4">Collaboration</div>
          {u.can("reviews:perform") && <NavLink href="/reviews" badge={pendingReviews}>Review Queue</NavLink>}
          <NavLink href="/meetings" badge={meetingRequests}>Meetings</NavLink>
          <NavLink href="/notifications" badge={unread}>Notifications</NavLink>
          <NavLink href="/settings/security">Account security</NavLink></>;

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-accent-ink">IH</span>
          <span className="font-semibold tracking-tight">InternHub</span>
        </Link>
        <nav aria-label="Main navigation" className="flex-1 space-y-0.5 overflow-y-auto">
          {navigation}
        </nav>
        <div className="mt-4 border-t border-line px-2 pt-4">
          <div className="flex items-center gap-2">
            <Avatar name={u.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{u.name}</div>
              <div className="truncate text-xs text-muted">{u.studentCode ?? u.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="mt-3 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-2 hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* compact top bar on phones */}
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <span className="font-semibold">InternHub</span>
          <details className="relative">
            <summary className="cursor-pointer rounded px-3 py-2">Menu</summary>
            <nav aria-label="Mobile navigation" className="absolute right-0 top-full z-20 max-h-[75dvh] w-72 overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-lg">{navigation}
              <form action={logoutAction}><button className="btn-ghost mt-3 w-full">Sign out</button></form>
            </nav>
          </details>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">
          <Suspense fallback={<div className="h-7 w-64 animate-pulse rounded bg-line/60" />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
