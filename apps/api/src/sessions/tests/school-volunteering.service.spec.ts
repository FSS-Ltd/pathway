import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { SchoolVolunteeringService } from "../school-volunteering.service";
import type { RotaAccessService } from "../rota-access.service";

jest.mock("@pathway/db", () => ({
  ...jest.requireActual<typeof import("@pathway/db")>("@pathway/db"),
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));

const openDate = new Date("2027-10-12T00:00:00.000Z");
const nextDate = new Date("2027-10-13T00:00:00.000Z");
const period = {
  id: "period-a",
  name: "Autumn",
  academicYearId: "year-a",
  startsOn: new Date("2027-09-01T00:00:00.000Z"),
  endsOn: new Date("2027-12-20T00:00:00.000Z"),
};

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findFirst: jest.fn().mockResolvedValue({ id: "parent-a" }) },
    guardianIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: "guardian-a" }),
    },
    academicPeriod: {
      findMany: jest.fn().mockResolvedValue([period]),
      findFirst: jest.fn().mockResolvedValue(period),
    },
    aceTeachingDate: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ date: openDate }, { date: nextDate }]),
    },
    aceSchoolVolunteerReservation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: "reservation-a" }),
      create: jest.fn().mockResolvedValue({ id: "reservation-new" }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({
    orgId: "org-a",
    timezone: "Europe/London",
    org: {
      parentPortalEnabled: true,
      orgVertical: { vertical: "ACE_SCHOOL" },
    },
  } as never);
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, operation) =>
      operation(tx as never),
    );
  const rotaAccess = {
    assertTeamViewer: jest.fn().mockResolvedValue(undefined),
    assertManager: jest.fn().mockResolvedValue(undefined),
    canManage: jest.fn().mockResolvedValue(true),
  } as unknown as RotaAccessService;
  return { tx, rotaAccess, service: new SchoolVolunteeringService(rotaAccess) };
}

describe("school volunteer rota", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows capacity and the parent's own selection without peer identities", async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValue([
      { date: openDate, slot: 1 },
      { date: openDate, slot: 2 },
    ]);
    tx.aceSchoolVolunteerReservation.findMany.mockResolvedValue([
      { date: openDate },
    ]);
    const calendar = await service.parentCalendar("site-a", "parent-a");
    expect(calendar.periods[0].days).toEqual([
      { date: "2027-10-12", status: "Selected", spacesLeft: 0 },
      { date: "2027-10-13", status: "Available", spacesLeft: 2 },
    ]);
    expect(JSON.stringify(calendar)).not.toContain("guardian-a");
    expect(tx.guardianIdentity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "parent-a",
          relationships: {
            some: expect.objectContaining({
              legalAccess: "FULL",
              endedAt: null,
              revokedAt: null,
            }),
          },
        }),
      }),
    );
  });

  it("allocates the remaining place and audits the reservation", async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValue([{ date: openDate, slot: 1 }]);
    const result = await service.saveParentChoices(
      "site-a",
      "period-a",
      "parent-a",
      { dates: ["2027-10-12"] },
    );
    expect(result).toEqual({ added: 1, removed: 0 });
    expect(tx.aceSchoolVolunteerReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "site-a",
          guardianIdentityId: "guardian-a",
          slot: 2,
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "reservation-new",
        actorUserId: "parent-a",
      }),
    });
  });

  it("rejects a full day without creating a reservation", async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValue([
      { date: openDate, slot: 1 },
      { date: openDate, slot: 2 },
    ]);
    await expect(
      service.saveParentChoices("site-a", "period-a", "parent-a", {
        dates: ["2027-10-12"],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.aceSchoolVolunteerReservation.create).not.toHaveBeenCalled();
  });

  it("denies a revoked guardian before reading reservations", async () => {
    const { tx, service } = setup();
    tx.guardianIdentity.findFirst.mockResolvedValue(null);
    await expect(
      service.parentCalendar("site-a", "parent-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.aceSchoolVolunteerReservation.findMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("does not expose volunteering outside the ACE vertical", async () => {
    const { service } = setup();
    jest.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      orgId: "org-a",
      timezone: "Europe/London",
      org: { parentPortalEnabled: true, orgVertical: null },
    } as never);
    await expect(
      service.parentCalendar("site-a", "parent-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });

  it("allows an authorised manager to cancel after a guardian link has ended", async () => {
    const { tx, rotaAccess, service } = setup();
    const actor = {
      userId: "manager-a",
      orgId: "org-a",
      tenantId: "site-a",
      isSuperUser: false,
    };
    await service.cancelByManager(
      actor,
      "reservation-a",
      "Parent requested a change",
    );
    expect(rotaAccess.assertManager).toHaveBeenCalledWith(actor);
    expect(tx.guardianIdentity.findFirst).not.toHaveBeenCalled();
    expect(tx.aceSchoolVolunteerReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation-a" },
      data: {
        cancelledAt: expect.any(Date),
        cancelledByUserId: "manager-a",
        cancellationReason: "Parent requested a change",
      },
    });
  });

  it("does not enter a tenant transaction when staff rota access is denied", async () => {
    const { rotaAccess, service } = setup();
    jest
      .mocked(rotaAccess.assertTeamViewer)
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(
      service.staffRota(
        {
          userId: "parent-a",
          orgId: "org-a",
          tenantId: "site-a",
          isSuperUser: false,
        },
        { from: "2027-10-12", to: "2027-10-18" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });
});
