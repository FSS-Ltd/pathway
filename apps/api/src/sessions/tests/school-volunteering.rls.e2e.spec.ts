import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { RotaAccessService } from "../rota-access.service";
import { SchoolVolunteeringService } from "../school-volunteering.service";

const siteId = randomUUID();
const otherSiteId = randomUUID();
const orgId = randomUUID();

describe("school volunteer reservation RLS and capacity", () => {
  it("shows a parent only their own placement, allows site staff, and rejects a third slot", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
      throw new Error("School volunteer RLS test requires the tenant RLS role");
    }

    await prisma.org.create({
      data: {
        id: orgId,
        name: `Volunteer ${orgId}`,
        slug: `volunteer-${orgId}`,
        planCode: "trial",
        parentPortalEnabled: true,
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Volunteer site ${id}`,
        slug: `volunteer-${id}`,
      })),
    });

    const yearId = randomUUID();
    const periodId = randomUUID();
    const childId = randomUUID();
    const parentIds = [randomUUID(), randomUUID()];
    const guardianIds = [randomUUID(), randomUUID()];
    const staffId = randomUUID();
    const date = new Date("2090-10-12T00:00:00.000Z");
    const reservations = await withTenantRlsContext(
      siteId,
      orgId,
      async (tx) => {
        await tx.academicYear.create({
          data: {
            id: yearId,
            tenantId: siteId,
            name: `Volunteer ${yearId}`,
            startsOn: new Date("2090-09-01T00:00:00.000Z"),
            endsOn: new Date("2091-08-31T00:00:00.000Z"),
          },
        });
        await tx.academicPeriod.create({
          data: {
            id: periodId,
            tenantId: siteId,
            academicYearId: yearId,
            name: "Autumn",
            startsOn: new Date("2090-09-01T00:00:00.000Z"),
            endsOn: new Date("2090-12-20T00:00:00.000Z"),
          },
        });
        await tx.aceTeachingDate.create({
          data: {
            tenantId: siteId,
            academicYearId: yearId,
            date,
            kind: "TEACHING",
          },
        });
        await tx.child.create({
          data: {
            id: childId,
            tenantId: siteId,
            firstName: "Volunteer",
            lastName: "Child",
          },
        });
        for (let index = 0; index < parentIds.length; index += 1) {
          await tx.user.create({
            data: {
              id: parentIds[index],
              email: `${parentIds[index]}@example.test`,
            },
          });
          await tx.guardianIdentity.create({
            data: {
              id: guardianIds[index],
              tenantId: siteId,
              userId: parentIds[index],
            },
          });
          await tx.guardianChildRelationship.create({
            data: {
              tenantId: siteId,
              guardianIdentityId: guardianIds[index],
              childId,
            },
          });
        }
        await tx.user.create({
          data: { id: staffId, email: `${staffId}@example.test` },
        });
        await tx.siteMembership.create({
          data: { tenantId: siteId, userId: staffId, role: "STAFF" },
        });
        const rows = [];
        for (let index = 0; index < parentIds.length; index += 1) {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${parentIds[index]}, true)`;
          rows.push(
            await tx.aceSchoolVolunteerReservation.create({
              data: {
                tenantId: siteId,
                guardianIdentityId: guardianIds[index],
                academicPeriodId: periodId,
                date,
                slot: index + 1,
              },
            }),
          );
        }
        return rows;
      },
    );

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const scope = { id: { in: reservations.map(({ id }) => id) } };
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      await tx.$executeRaw`SELECT set_config('app.user_id', ${parentIds[0]}, true)`;
      expect(
        (await tx.aceSchoolVolunteerReservation.findMany({ where: scope })).map(
          ({ id }) => id,
        ),
      ).toEqual([reservations[0].id]);
      await tx.$executeRaw`SELECT set_config('app.ace_volunteer_staff_view', 'on', true)`;
      expect(
        (await tx.aceSchoolVolunteerReservation.findMany({ where: scope })).map(
          ({ id }) => id,
        ),
      ).toEqual([reservations[0].id]);
      await tx.$executeRaw`SELECT set_config('app.user_id', ${staffId}, true)`;
      expect(
        (
          await tx.aceSchoolVolunteerReservation.findMany({
            where: scope,
            orderBy: { slot: "asc" },
          })
        ).map(({ id }) => id),
      ).toEqual(reservations.map(({ id }) => id));
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
      expect(
        await tx.aceSchoolVolunteerReservation.findMany({ where: scope }),
      ).toEqual([]);
    });

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.user.update({
        where: { id: staffId },
        data: { isActive: false },
      });
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      await tx.$executeRaw`SELECT set_config('app.user_id', ${staffId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.ace_volunteer_staff_view', 'on', true)`;
      expect(
        await tx.aceSchoolVolunteerReservation.findMany({
          where: { id: { in: reservations.map(({ id }) => id) } },
        }),
      ).toEqual([]);
    });

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${parentIds[0]}, true)`;
        await tx.aceSchoolVolunteerReservation.create({
          data: {
            tenantId: siteId,
            guardianIdentityId: guardianIds[0],
            academicPeriodId: periodId,
            date,
            slot: 1,
          },
        });
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const thirdParentId = randomUUID();
    const thirdGuardianId = randomUUID();
    const nextDate = new Date("2090-10-13T00:00:00.000Z");
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.user.create({
        data: { id: thirdParentId, email: `${thirdParentId}@example.test` },
      });
      await tx.guardianIdentity.create({
        data: { id: thirdGuardianId, tenantId: siteId, userId: thirdParentId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: thirdGuardianId,
          childId,
        },
      });
      await tx.aceTeachingDate.create({
        data: {
          tenantId: siteId,
          academicYearId: yearId,
          date: nextDate,
          kind: "TEACHING",
        },
      });
      await tx.$executeRaw`SELECT set_config('app.user_id', ${thirdParentId}, true)`;
      await tx.aceSchoolVolunteerReservation.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: thirdGuardianId,
          academicPeriodId: periodId,
          date: nextDate,
          slot: 1,
        },
      });
    });
    const service = new SchoolVolunteeringService(new RotaAccessService());
    const calendar = await service.parentCalendar(siteId, parentIds[0]);
    expect(
      calendar.periods.find(({ id }) => id === periodId)?.days,
    ).toContainEqual({
      date: "2090-10-12",
      status: "Selected",
      spacesLeft: 0,
    });
    const choices = { dates: ["2090-10-12", "2090-10-13"] };
    const results = await Promise.allSettled(
      parentIds.map((parentId) =>
        service.saveParentChoices(siteId, periodId, parentId, choices),
      ),
    );
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const occupied = await withTenantRlsContext(siteId, orgId, async (tx) =>
      tx.aceSchoolVolunteerReservation.count({
        where: { tenantId: siteId, date: nextDate, cancelledAt: null },
      }),
    );
    expect(occupied).toBe(2);
  });
});
