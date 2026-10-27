import type { RoleKey } from "@prisma/client";

/**
 * Role + permission based access control.
 * Roles give a default bundle; PermissionGrant rows add extra permissions to
 * individual users (e.g. a mentor who also reviews).
 */
export const PERMISSIONS = [
  "leads:read",
  "leads:manage",
  "admissions:approve",
  "students:read",
  "internships:manage",
  "teams:manage",
  "projects:manage",
  "tasks:manage", // create/edit/assign tasks in teams you can access
  "tasks:update_own",
  "submissions:create",
  "reviews:perform",
  "reviews:assign",
  "meetings:create_team",
  "meetings:request",
  "meetings:schedule_official", // admin head review, final presentation
  "meetings:approve",
  "presentations:evaluate",
  "analytics:read_all",
  "audit:read",
  "settings:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: [
    "leads:read",
    "leads:manage",
    "admissions:approve",
    "students:read",
    "internships:manage",
    "teams:manage",
    "projects:manage",
    "tasks:manage",
    "reviews:assign",
    "reviews:perform",
    "meetings:create_team",
    "meetings:schedule_official",
    "meetings:approve",
    "presentations:evaluate",
    "analytics:read_all",
    "audit:read",
  ],
  MENTOR: [
    "students:read",
    "tasks:manage",
    "reviews:perform",
    "meetings:create_team",
    "meetings:schedule_official",
    "presentations:evaluate",
  ],
  REVIEWER: ["reviews:perform", "presentations:evaluate"],
  TEAM_LEADER: ["meetings:create_team", "tasks:update_own", "submissions:create", "meetings:request"],
  STUDENT: ["tasks:update_own", "submissions:create", "meetings:request"],
};

export function permissionsFor(roles: RoleKey[], grants: string[] = []): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) ROLE_PERMISSIONS[r].forEach((p) => set.add(p));
  for (const g of grants) if ((PERMISSIONS as readonly string[]).includes(g)) set.add(g as Permission);
  return set;
}

export const STAFF_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN"];

export const ROLE_LABEL: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin / Coordinator",
  MENTOR: "Mentor",
  REVIEWER: "Reviewer",
  TEAM_LEADER: "Team Leader",
  STUDENT: "Student",
};
