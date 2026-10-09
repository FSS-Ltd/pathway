import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { createSubjectTimetableFixture } from "./ace-subject-timetable.fixture";

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Subject timetable RLS test requires ${name}`);
  return value;
}

const orgId = requiredFixture("E2E_ORG_ID");
const siteId = requiredFixture("E2E_TENANT_ID");
const otherSiteId = requiredFixture("E2E_TENANT2_ID");

describe("ACE subject timetable storage", () => {
  it("forces RLS on each table and hides records after a site switch", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
      throw new Error("Subject timetable test requires the tenant RLS role");
    }

    const flags = await prisma.$queryRaw<
      Array<{ name: string; enabled: boolean; forced: boolean }>
    >`
      SELECT c.relname AS "name", c.relrowsecurity AS "enabled",
             c.relforcerowsecurity AS "forced"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname IN (
        'AceTimetableSchedule', 'AceTimetableSlot',
        'AceStudentTimetableDraft', 'AceStudentTimetableEntry',
        'AceStudentTimetablePublication', 'AceStudentTimetablePublicationEntry'
      )
      ORDER BY c.relname
    `;
    expect(flags).toHaveLength(6);
    expect(flags.every((row) => row.enabled && row.forced)).toBe(true);

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const record = await createSubjectTimetableFixture(tx, siteId);
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      expect(
        await tx.aceTimetableSchedule.count({
          where: { id: record.schedule.id },
        }),
      ).toBe(1);
      expect(
        await tx.aceTimetableSlot.count({ where: { id: record.slot.id } }),
      ).toBe(1);
      expect(
        await tx.aceStudentTimetableDraft.count({
          where: { id: record.draft.id },
        }),
      ).toBe(1);
      expect(
        await tx.aceStudentTimetableEntry.count({
          where: { id: record.entry.id },
        }),
      ).toBe(1);
      expect(
        await tx.aceStudentTimetablePublication.count({
          where: { id: record.publication.id },
        }),
      ).toBe(1);
      expect(
        await tx.aceStudentTimetablePublicationEntry.count({
          where: { id: record.publishedEntry.id },
        }),
      ).toBe(1);

      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
      expect(
        await tx.aceTimetableSchedule.count({
          where: { id: record.schedule.id },
        }),
      ).toBe(0);
      expect(
        await tx.aceTimetableSlot.count({ where: { id: record.slot.id } }),
      ).toBe(0);
      expect(
        await tx.aceStudentTimetableDraft.count({
          where: { id: record.draft.id },
        }),
      ).toBe(0);
      expect(
        await tx.aceStudentTimetableEntry.count({
          where: { id: record.entry.id },
        }),
      ).toBe(0);
      expect(
        await tx.aceStudentTimetablePublication.count({
          where: { id: record.publication.id },
        }),
      ).toBe(0);
      expect(
        await tx.aceStudentTimetablePublicationEntry.count({
          where: { id: record.publishedEntry.id },
        }),
      ).toBe(0);
    });
  });

  it("rejects a draft attached to a schedule in another period", async () => {
    if (!requireDatabase()) return;
    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const record = await createSubjectTimetableFixture(tx, siteId);
        const otherPeriod = await tx.academicPeriod.create({
          data: {
            tenantId: siteId,
            academicYearId: record.yearId,
            name: "Spring",
            startsOn: new Date("2045-01-01T00:00:00.000Z"),
            endsOn: new Date("2045-04-01T00:00:00.000Z"),
            status: "ARCHIVED",
          },
        });
        await tx.aceStudentTimetableDraft.create({
          data: {
            tenantId: siteId,
            childId: record.childId,
            academicPeriodId: otherPeriod.id,
            scheduleId: record.schedule.id,
            updatedByUserId: record.actorId,
          },
        });
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a slot that points at a schedule in another site", async () => {
    if (!requireDatabase()) return;
    const record = await withTenantRlsContext(siteId, orgId, (tx) =>
      createSubjectTimetableFixture(tx, siteId),
    );
    await expect(
      withTenantRlsContext(otherSiteId, orgId, async (tx) => {
        await tx.aceTimetableSlot.create({
          data: {
            tenantId: otherSiteId,
            scheduleId: record.schedule.id,
            position: 1,
            kind: "BREAK",
            label: "Cross-site",
            startMinutes: 600,
            endMinutes: 630,
          },
        });
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("preserves an issued snapshot while recording one withdrawal", async () => {
    if (!requireDatabase()) return;
    const record = await withTenantRlsContext(siteId, orgId, (tx) =>
      createSubjectTimetableFixture(tx, siteId),
    );
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.subject.update({
        where: { id: record.entry.subjectId },
        data: { name: "Renamed subject" },
      });
      const snapshot = await tx.aceStudentTimetablePublicationEntry.findUnique({
        where: { id: record.publishedEntry.id },
        select: { subjectName: true },
      });
      expect(snapshot?.subjectName).toBe("Reading");
    });
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.aceStudentTimetablePublication.update({
        where: { id: record.publication.id },
        data: {
          withdrawnAt: new Date(),
          withdrawnByUserId: record.actorId,
          withdrawalReason: "Issued in error",
        },
      });
    });
    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        await tx.$executeRaw`
          UPDATE "AceStudentTimetablePublicationEntry"
          SET "subjectName" = 'Changed'
          WHERE "id" = ${record.publishedEntry.id}
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "AceStudentTimetablePublicationEntry" (
            "id", "tenantId", "publicationId", "day", "slotPosition",
            "slotKind", "slotLabel", "startMinutes", "endMinutes"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${record.publication.id},
            'WEDNESDAY'::"AceTimetableDay", 0,
            'BREAK'::"AceTimetableSlotKind", 'Late addition', 600, 630
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        await tx.$executeRaw`
          UPDATE "AceStudentTimetablePublication"
          SET "withdrawalReason" = 'Changed'
          WHERE "id" = ${record.publication.id}
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });
});
