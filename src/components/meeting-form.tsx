"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "./forms";
import { createMeetingAction } from "@/app/actions";

type TeamOpt = { id: string; name: string; projects: { id: string; title: string; phases: { id: string; order: number; title: string }[] }[] };

const TYPES = [
  { v: "TEAM_MEETING", l: "Team Meeting" },
  { v: "MENTOR_REVIEW", l: "Mentor Review" },
  { v: "PHASE_PRESENTATION", l: "Phase Presentation" },
  { v: "ADMIN_HEAD_REVIEW", l: "Admin Head Review" },
  { v: "FINAL_PRESENTATION", l: "Final Presentation" },
] as const;

/**
 * `schedulable` = types this user may book directly; `requestable` = types
 * they can only request (an admin/mentor confirms).
 */
export function MeetingForm({ teams, schedulable, requestable, defaults }: { teams: TeamOpt[]; schedulable: string[]; requestable: string[]; defaults: { teamId?: string; projectId?: string } }) {
  const allowed = TYPES.filter((t) => schedulable.includes(t.v) || requestable.includes(t.v));
  const [type, setType] = useState<string>(allowed[0]?.v ?? "TEAM_MEETING");
  const [teamId, setTeamId] = useState(defaults.teamId ?? teams[0]?.id ?? "");
  const [projectId, setProjectId] = useState(defaults.projectId ?? "");
  const team = teams.find((t) => t.id === teamId);
  const project = team?.projects.find((p) => p.id === projectId);
  const isRequest = !schedulable.includes(type) && requestable.includes(type);
  const isPresentation = type.includes("PRESENTATION");

  if (!allowed.length) return <p className="text-sm text-muted">You can&rsquo;t schedule meetings for any team yet.</p>;

  return (
    <ActionForm action={createMeetingAction}>
      <input type="hidden" name="mode" value={isRequest ? "request" : "schedule"} />
      <div>
        <span className="label">Meeting type</span>
        <div className="flex flex-wrap gap-2">
          {allowed.map((t) => (
            <label key={t.v} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${type === t.v ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>
              <input type="radio" name="type" value={t.v} checked={type === t.v} onChange={() => setType(t.v)} className="sr-only" />
              {t.l}
              {!schedulable.includes(t.v) && " (request)"}
            </label>
          ))}
        </div>
        {isRequest && <p className="mt-2 text-xs text-warn">This will be sent as a request — an admin or your mentor confirms the final time.</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Team</span>
          <select name="teamId" value={teamId} onChange={(e) => { setTeamId(e.target.value); setProjectId(""); }} className="input">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>Team {t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Project {isPresentation && "*"}</span>
          <select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input" required={isPresentation}>
            <option value="">—</option>
            {team?.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
        {!isRequest && (
          <label className="block">
            <span className="label">Phase</span>
            <select name="phaseId" className="input" disabled={!project}>
              <option value="">—</option>
              {project?.phases.map((ph) => (
                <option key={ph.id} value={ph.id}>{ph.order}. {ph.title}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="block">
        <span className="label">Title</span>
        <input name="title" required className="input" placeholder={isPresentation ? "Phase 2 Presentation" : "Weekly sprint sync"} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">{isRequest ? "Proposed date & time (IST)" : "Date & time (IST)"}</span>
          <input name="startsAt" type="datetime-local" required className="input" />
        </label>
        {!isRequest && (
          <>
            <label className="block">
              <span className="label">Duration</span>
              <select name="durationMin" className="input" defaultValue="60">
                {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Meeting link</span>
              <input name="meetingUrl" type="url" className="input" placeholder="https://meet.google.com/…" />
            </label>
          </>
        )}
      </div>

      <label className="block">
        <span className="label">Agenda</span>
        <textarea name="agenda" rows={3} className="input" defaultValue="Review completed tasks, blockers, and next milestones." />
      </label>
      {isPresentation && (
        <label className="block">
          <span className="label">Expected deliverables</span>
          <input name="expectedDeliverables" className="input" placeholder="Slides, live demo, GitHub repo" />
        </label>
      )}
      <SubmitButton pendingLabel="Sending…">{isRequest ? "Send request" : "Schedule & invite team"}</SubmitButton>
    </ActionForm>
  );
}
