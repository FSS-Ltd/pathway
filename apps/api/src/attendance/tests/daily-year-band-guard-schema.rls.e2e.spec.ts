import { randomUUID } from "node:crypto";
import { prisma } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

describe("ACE year-band assignment membership schema", () => {
  it("reads membership beside the triggering table", async () => {
    if (!requireDatabase()) return;

    const tenantId = randomUUID();
    const userId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE "User" (
          "id" text PRIMARY KEY,
          "isActive" boolean NOT NULL
        ) ON COMMIT DROP
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE "SiteMembership" (
          "tenantId" text NOT NULL,
          "userId" text NOT NULL,
          "role" text NOT NULL
        ) ON COMMIT DROP
      `);
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE "ProbeAssignment" (
          "tenantId" text NOT NULL,
          "userId" text NOT NULL
        ) ON COMMIT DROP
      `);
      await tx.$executeRawUnsafe(`
        CREATE TRIGGER "ProbeAssignment_require_membership"
        BEFORE INSERT ON "ProbeAssignment"
        FOR EACH ROW EXECUTE FUNCTION app.require_ace_staff_year_band_membership()
      `);

      await tx.$executeRaw`
        INSERT INTO "User" ("id", "isActive") VALUES (${userId}, true)
      `;
      await tx.$executeRaw`
        INSERT INTO "SiteMembership" ("tenantId", "userId", "role")
        VALUES (${tenantId}, ${userId}, 'STAFF')
      `;

      expect(
        await tx.$executeRaw`
          INSERT INTO "ProbeAssignment" ("tenantId", "userId")
          VALUES (${tenantId}, ${userId})
        `,
      ).toBe(1);
    });
  });
});
