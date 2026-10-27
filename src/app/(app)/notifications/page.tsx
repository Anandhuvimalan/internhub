import Link from "next/link";
import type { NotificationCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { listNotifications } from "@/server/queries";
import { Empty, PageHeader } from "@/components/ui";
import { relative } from "@/lib/format";
import { markAllReadAction } from "@/app/actions";

export const metadata = { title: "Notifications" };
const CATS: { key: NotificationCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTION", label: "Waiting for action" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "HISTORY", label: "History" },
];

export default async function Notifications(props: PageProps<"/notifications">) {
  const sp = await props.searchParams;
  const u = await pageUser();
  const cat = CATS.find((c) => c.key === sp.c)?.key ?? "ALL";
  const { items, nextCursor } = await listNotifications(u, { category: cat === "ALL" ? undefined : cat, cursor: sp.cursor ? String(sp.cursor) : undefined, take: 30 });
  const unread = await db.notification.count({ where: { userId: u.id, readAt: null } });

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        subtitle={`${unread} unread`}
        actions={
          unread > 0 && (
            <form action={markAllReadAction}>
              <button className="btn-ghost">Mark all as read</button>
            </form>
          )
        }
      />
      <nav className="mb-4 flex gap-5 border-b border-line">
        {CATS.map((c) => (
          <Link key={c.key} href={`?c=${c.key}`} className={`tab ${cat === c.key ? "tab-active" : ""}`}>{c.label}</Link>
        ))}
      </nav>
      {items.length ? (
        <ul className="card divide-y divide-line">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? "#"} className={`flex gap-3 px-5 py-3.5 hover:bg-surface-2 ${n.readAt ? "" : "bg-accent-soft/40"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="truncate text-sm text-muted">{n.body}</div>}
                </div>
                <span className="shrink-0 text-xs text-muted">{relative(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No notifications" />
      )}
      {nextCursor && <Link href={`?c=${cat}&cursor=${nextCursor}`} className="mt-4 inline-block text-sm link">Older →</Link>}
    </>
  );
}
