import Link from "next/link";
import type { MeetingStatus, MeetingType } from "@prisma/client";
import { fmtTime, monthDay } from "@/lib/format";
import { Badge, Empty } from "./ui";

const TYPE_LABEL: Record<MeetingType, string> = {
  TEAM_MEETING: "Meeting",
  MENTOR_REVIEW: "Mentor review",
  PHASE_PRESENTATION: "Present",
  ADMIN_HEAD_REVIEW: "Admin review",
  FINAL_PRESENTATION: "Final",
};

export function ScheduleList({ meetings }: { meetings: { id: string; title: string; type: MeetingType; status: MeetingStatus; startsAt: Date }[] }) {
  if (!meetings.length) return <Empty title="Nothing scheduled">Upcoming meetings and presentations appear here.</Empty>;
  return (
    <ul className="space-y-1">
      {meetings.map((m) => {
        const { month, day } = monthDay(m.startsAt);
        return (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
              <div className="w-11 shrink-0 rounded-md border border-line bg-surface-2 py-1 text-center">
                <div className="text-[10px] font-semibold text-muted">{month}</div>
                <div className="text-base font-semibold leading-tight tabular-nums">{day}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.title}</div>
                <div className="text-xs text-muted">{m.status === "REQUESTED" ? "Time to be confirmed" : `${fmtTime(m.startsAt)} IST`}</div>
              </div>
              {m.status === "REQUESTED" ? <Badge tone="warn">Pending</Badge> : <Badge tone={m.type.includes("PRESENTATION") ? "accent" : "info"}>{TYPE_LABEL[m.type]}</Badge>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
