import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { FamilyTimetableService } from "../family-timetable.service";

jest.mock("@pathway/db", () => ({
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));

const range = {
  from: new Date("2026-10-12T00:00:00.000Z"),
  to: new Date("2026-10-19T00:00:00.000Z"),
};
const child = {
  id: "child-a",
  firstName: "Ari",
  preferredName: null,
  groupId: "group-a",
};

function setup() {
  const tx = {
    guardianChildRelationship: {
      findFirst: jest.fn().mockResolvedValue({ child }),
    },
    studentPortalPolicy: {
      findUnique: jest.fn().mockResolvedValue({ studentPortalEnabled: true }),
    },
    studentIdentityLink: {
      findMany: jest.fn().mockResolvedValue([{ child }]),
    },
    session: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "session-a",
          title: "Maths",
          startsAt: new Date("2026-10-13T09:00:00.000Z"),
          endsAt: new Date("2026-10-13T10:00:00.000Z"),
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: "session-a",
        familyPublishedAt: null,
        groups: [{ id: "group-a" }],
      }),
      update: jest.fn().mockResolvedValue({ familyPublishedAt: new Date() }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({
    orgId: "org-a",
    timezone: "Europe/London",
    org: { parentPortalEnabled: true },
  } as never);
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_siteId, _orgId, operation) =>
      operation(tx as never),
    );
  return { tx, service: new FamilyTimetableService() };
}

describe("family timetable access", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries only published sessions for the linked child's group", async () => {
    const { tx, service } = setup();
    const result = await service.list(
      "site-a",
      "parent-a",
      { kind: "parent", childId: "child-a" },
      range,
    );
    expect(result.childName).toBe("Ari");
    expect(result.items).toHaveLength(1);
    expect(tx.guardianChildRelationship.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "site-a",
        childId: "child-a",
        legalAccess: "FULL",
        endedAt: null,
        revokedAt: null,
      }),
      select: expect.any(Object),
    });
    expect(tx.session.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "site-a",
        familyPublishedAt: { not: null },
        groups: { some: { id: "group-a" } },
        startsAt: { lt: range.to },
        endsAt: { gt: range.from },
      },
      select: expect.any(Object),
      orderBy: { startsAt: "asc" },
      take: 100,
    });
  });

  it("denies unlinked parents and disabled student access", async () => {
    const { tx, service } = setup();
    tx.guardianChildRelationship.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.list(
        "site-a",
        "parent-a",
        { kind: "parent", childId: "child-a" },
        range,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.studentPortalPolicy.findUnique.mockResolvedValueOnce({
      studentPortalEnabled: false,
    });
    await expect(
      service.list("site-a", "student-a", { kind: "student" }, range),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.session.findMany).not.toHaveBeenCalled();
  });

  it("audits publication and rejects sessions without a group", async () => {
    const { tx, service } = setup();
    await service.setPublication(
      "session-a",
      "site-a",
      "org-a",
      "manager-a",
      true,
    );
    expect(tx.session.update).toHaveBeenCalledWith({
      where: { id: "session-a" },
      data: { familyPublishedAt: expect.any(Date) },
      select: { familyPublishedAt: true },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "site-a",
        orgId: "org-a",
        actorUserId: "manager-a",
        entityId: "session-a",
        metadata: { recordType: "Session", event: "published" },
      }),
    });
    tx.session.findFirst.mockResolvedValueOnce({
      id: "session-a",
      familyPublishedAt: null,
      groups: [],
    });
    await expect(
      service.setPublication("session-a", "site-a", "org-a", "manager-a", true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.session.update).toHaveBeenCalledTimes(1);
  });
});
