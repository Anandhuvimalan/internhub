import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createInitialAdmin } from "@/server/bootstrap";
import { verifyPassword } from "@/lib/password";
import { uid } from "../factories";

describe("initial-admin bootstrap", () => {
  it("initializes only once, preserves the password, and serializes competing initializers", async () => {
    // This test owns its temporary admin roles; other suite data is preserved.
    const existing = await db.roleAssignment.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
    await db.roleAssignment.deleteMany({ where: { id: { in: existing.map((r) => r.id) } } });
    const email = `bootstrap-${uid()}@test.dev`;
    try {
      const results = await Promise.all([1, 2].map(() => createInitialAdmin({ name: "First Admin", email, password: "bootstrap-password-123" })));
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(await createInitialAdmin({ name: "Replacement", email, password: "different-password-456" })).toEqual({ created: false });
      const user = await db.user.findUniqueOrThrow({ where: { email } });
      expect(await verifyPassword("bootstrap-password-123", user.passwordHash!)).toBe(true);
      expect(await verifyPassword("different-password-456", user.passwordHash!)).toBe(false);
    } finally {
      await db.user.deleteMany({ where: { email } });
      if (existing.length) await db.roleAssignment.createMany({ data: existing });
    }
  });
});
