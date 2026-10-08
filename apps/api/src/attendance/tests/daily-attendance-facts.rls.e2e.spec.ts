import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;

if (!orgId || !siteId || !otherSiteId) {
  throw new Error("Daily attendance RLS test requires seeded E2E sites");
}

async function createFixture(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dateString: string,
  calendar: "TEACHING" | "HOLIDAY" | "NONE" = "TEACHING",
) {
  const actorId = randomUUID();
  const childId = randomUUID();
  const yearId = randomUUID();
  const bandId = randomUUID();
  const date = new Date(`${dateString}T00:00:00.000Z`);

  await tx.tenant.update({
    where: { id: tenantId },
    data: { timezone: "Europe/London" },
  });
  await tx.user.create({
    data: { id: actorId, email: `${actorId}@example.test`, tenantId },
  });
  await tx.siteMembership.create({
    data: { tenantId, userId: actorId },
  });
  await tx.child.create({
    data: {
      id: childId,
      tenantId,
      firstName: "Daily",
      lastName: "Register",
    },
  });
  await tx.academicYear.create({
    data: {
      id: yearId,
      tenantId,
      name: `Daily ${yearId}`,
      startsOn: new Date("2042-09-01T00:00:00.000Z"),
      endsOn: new Date("2043-08-31T00:00:00.000Z"),
      status: "ARCHIVED",
    },
  });
  await tx.aceYearBand.create({
    data: { id: bandId, tenantId, name: `Daily ${bandId}` },
  });
  await tx.aceSchoolEnrollment.create({
    data: {
      tenantId,
      childId,
      academicYearId: yearId,
      yearBandId: bandId,
      startsOn: new Date("2042-09-01T00:00:00.000Z"),
    },
  });
  if (calendar !== "NONE") {
    await tx.aceTeachingDate.create({
      data: {
        tenantId,
        academicYearId: yearId,
        date,
        kind: calendar,
        reason: calendar === "HOLIDAY" ? "School holiday" : null,
      },
    });
  }

  return { actorId, childId, date };
}

describe("ACE daily attendance fact storage", () => {
  it("forces site RLS and records a reason-only correction separately from sessions", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
      throw new Error("Daily attendance test requires the tenant RLS role");
    }

    const flags = await prisma.$queryRaw<
      Array<{ name: string; enabled: boolean; forced: boolean }>
    >`
      SELECT c.relname AS "name", c.relrowsecurity AS "enabled",
             c.relforcerowsecurity AS "forced"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname IN ('AceDailyAttendance', 'AceDailyAttendanceCorrectionEvent')
      ORDER BY c.relname
    `;
    expect(flags).toEqual([
      { name: "AceDailyAttendance", enabled: true, forced: true },
      {
        name: "AceDailyAttendanceCorrectionEvent",
        enabled: true,
        forced: true,
      },
    ]);

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const { actorId, childId, date } = await createFixture(
        tx,
        siteId,
        "2042-09-02",
      );
      const mark = await tx.aceDailyAttendance.create({
        data: {
          tenantId: siteId,
          childId,
          date,
          status: "ABSENT",
          absenceReason: "SICK",
          recordedByUserId: actorId,
        },
      });
      const correctedMark = await tx.aceDailyAttendance.update({
        where: { id: mark.id },
        data: { absenceReason: "HOLIDAY" },
      });
      expect(correctedMark.recordedAt).toEqual(mark.recordedAt);
      expect(correctedMark.recordedByUserId).toBe(actorId);
      const correction = await tx.aceDailyAttendanceCorrectionEvent.create({
        data: {
          tenantId: siteId,
          dailyAttendanceId: mark.id,
          previousStatus: "ABSENT",
          newStatus: "ABSENT",
          previousReason: "SICK",
          newReason: "HOLIDAY",
          correctionReason: "Parent clarified the reason",
          correctedByUserId: actorId,
        },
      });

      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      expect(
        await tx.aceDailyAttendance.findMany({ where: { id: mark.id } }),
      ).toHaveLength(1);
      expect(
        await tx.aceDailyAttendanceCorrectionEvent.findMany({
          where: { id: correction.id },
        }),
      ).toHaveLength(1);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
      expect(
        await tx.aceDailyAttendance.findMany({ where: { id: mark.id } }),
      ).toEqual([]);
      expect(
        await tx.aceDailyAttendanceCorrectionEvent.findMany({
          where: { id: correction.id },
        }),
      ).toEqual([]);
    });
  });

  it("rejects an absent mark without a reason and a duplicate child/date", async () => {
    if (!requireDatabase()) return;

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const { actorId, childId, date } = await createFixture(
          tx,
          siteId,
          "2042-09-03",
        );
        await tx.aceDailyAttendance.create({
          data: {
            tenantId: siteId,
            childId,
            date,
            status: "ABSENT",
            recordedByUserId: actorId,
          },
        });
      }),
    ).rejects.toMatchObject({ code: "P2004" });

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const { actorId, childId, date } = await createFixture(
          tx,
          siteId,
          "2042-09-03",
        );
        const data = {
          tenantId: siteId,
          childId,
          date,
          status: "PRESENT" as const,
          recordedByUserId: actorId,
        };
        await tx.aceDailyAttendance.create({ data });
        await tx.aceDailyAttendance.create({ data });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects closed and unconfigured teaching dates", async () => {
    if (!requireDatabase()) return;

    for (const [dateString, calendar] of [
      ["2042-09-04", "HOLIDAY"],
      ["2042-09-05", "NONE"],
    ] as const) {
      await expect(
        withTenantRlsContext(siteId, orgId, async (tx) => {
          const { actorId, childId, date } = await createFixture(
            tx,
            siteId,
            dateString,
            calendar,
          );
          await tx.aceDailyAttendance.create({
            data: {
              tenantId: siteId,
              childId,
              date,
              status: "PRESENT",
              recordedByUserId: actorId,
            },
          });
        }),
      ).rejects.toMatchObject({ code: "P2004" });
    }
  });

  it("rejects corrections that do not match the mark and retains event history", async () => {
    if (!requireDatabase()) return;

    const { markId, actorId } = await withTenantRlsContext(
      siteId,
      orgId,
      async (tx) => {
        const fixture = await createFixture(tx, siteId, "2042-09-06");
        const mark = await tx.aceDailyAttendance.create({
          data: {
            tenantId: siteId,
            childId: fixture.childId,
            date: fixture.date,
            status: "PRESENT",
            recordedByUserId: fixture.actorId,
          },
        });
        return { markId: mark.id, actorId: fixture.actorId };
      },
    );

    await expect(
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceDailyAttendanceCorrectionEvent.create({
          data: {
            tenantId: siteId,
            dailyAttendanceId: markId,
            previousStatus: "ABSENT",
            previousReason: "SICK",
            newStatus: "LATE",
            correctionReason: "Incorrect target status",
            correctedByUserId: actorId,
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2003" });

    const eventId = await withTenantRlsContext(siteId, orgId, async (tx) => {
      const correctingActorId = randomUUID();
      await tx.user.create({
        data: {
          id: correctingActorId,
          email: `${correctingActorId}@example.test`,
          tenantId: siteId,
        },
      });
      await tx.siteMembership.create({
        data: { tenantId: siteId, userId: correctingActorId },
      });
      await tx.user.update({
        where: { id: actorId },
        data: { isActive: false },
      });
      await tx.aceDailyAttendance.update({
        where: { id: markId },
        data: { status: "ABSENT", absenceReason: "SICK" },
      });
      const event = await tx.aceDailyAttendanceCorrectionEvent.create({
        data: {
          tenantId: siteId,
          dailyAttendanceId: markId,
          previousStatus: "PRESENT",
          newStatus: "ABSENT",
          newReason: "SICK",
          correctionReason: "Sick absence confirmed",
          correctedByUserId: correctingActorId,
        },
      });
      return event.id;
    });

    await expect(
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceDailyAttendanceCorrectionEvent.delete({
          where: { id: eventId },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceDailyAttendance.delete({ where: { id: markId } }),
      ),
    ).rejects.toThrow();
    expect(
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceDailyAttendance.findUnique({ where: { id: markId } }),
      ),
    ).not.toBeNull();
    expect(
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceDailyAttendanceCorrectionEvent.findUnique({
          where: { id: eventId },
        }),
      ),
    ).not.toBeNull();
  });
});
