import { describe, expect, it } from "vitest";
import { permissionsFor } from "@/lib/permissions";
import { isOverdue, parseLocalDateTime, weightedTotal, toLocalInput } from "@/lib/format";
import { httpUrl } from "@/lib/validation";

describe("permissions (role + permission model)", () => {
  it("students cannot review, approve meetings or manage teams", () => {
    const p = permissionsFor(["STUDENT"]);
    expect(p.has("submissions:create")).toBe(true);
    expect(p.has("reviews:perform")).toBe(false);
    expect(p.has("meetings:approve")).toBe(false);
    expect(p.has("teams:manage")).toBe(false);
  });
  it("roles combine (student + team leader) and grants add extras", () => {
    const p = permissionsFor(["STUDENT", "TEAM_LEADER"], ["presentations:evaluate"]);
    expect(p.has("meetings:create_team")).toBe(true);
    expect(p.has("presentations:evaluate")).toBe(true);
  });
  it("unknown grant strings are ignored", () => {
    expect(permissionsFor(["STUDENT"], ["teams:everything"]).size).toBe(permissionsFor(["STUDENT"]).size);
  });
});

describe("overdue is a computed flag (FR-4)", () => {
  const past = new Date(Date.now() - 60_000);
  it("open task past due is overdue", () => expect(isOverdue({ dueAt: past, status: "IN_PROGRESS" })).toBe(true));
  it("approved / in-review / undated tasks are not overdue", () => {
    expect(isOverdue({ dueAt: past, status: "APPROVED" })).toBe(false);
    expect(isOverdue({ dueAt: past, status: "IN_REVIEW" })).toBe(false);
    expect(isOverdue({ dueAt: null, status: "TODO" })).toBe(false);
  });
});

describe("IST date handling", () => {
  it("datetime-local input is interpreted as IST (UTC+05:30)", () => {
    expect(parseLocalDateTime("2026-10-20T10:00").toISOString()).toBe("2026-10-20T04:30:00.000Z");
  });
  it("round-trips through toLocalInput", () => {
    expect(toLocalInput(parseLocalDateTime("2026-01-05T23:45"))).toBe("2026-01-05T23:45");
  });
  it("rejects garbage", () => expect(() => parseLocalDateTime("not-a-date")).toThrow());
});

describe("presentation scoring (FR-8 weights 30/30/20/10/10)", () => {
  it("weights the five criteria", () => {
    expect(weightedTotal({ technical: 100, implementation: 0, communication: 0, contribution: 0, qa: 0 })).toBe(30);
    expect(weightedTotal({ technical: 80, implementation: 90, communication: 70, contribution: 100, qa: 60 })).toBe(81);
  });
});

describe("user links are http(s) only", () => {
  const schema = httpUrl();
  it("accepts https", () => expect(schema.safeParse("https://meet.google.com/abc").success).toBe(true));
  it("rejects javascript: and data: URLs", () => {
    expect(schema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(schema.safeParse("data:text/html,<script>1</script>").success).toBe(false);
  });
});
