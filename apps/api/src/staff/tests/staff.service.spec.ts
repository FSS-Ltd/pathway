import { StaffService } from "../staff.service";
import { updateProfileDto } from "../dto/update-profile.dto";

jest.mock("@pathway/db", () => ({
  prisma: {
    org: { findUnique: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
    userOrgRole: { findFirst: jest.fn() },
    siteMembership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userTenantRole: { findFirst: jest.fn() },
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    staffUnavailableDate: { findMany: jest.fn() },
    $transaction: jest.fn(),
    volunteerPreference: { findMany: jest.fn() },
    staffPreferredGroup: { findMany: jest.fn() },
  },
  Weekday: {
    SUN: "SUN",
    MON: "MON",
    TUE: "TUE",
    WED: "WED",
    THU: "THU",
    FRI: "FRI",
    SAT: "SAT",
  },
  OrgRole: { ORG_ADMIN: "ORG_ADMIN" },
  SiteRole: { SITE_ADMIN: "SITE_ADMIN" },
  Role: { ADMIN: "ADMIN" },
  runTransaction: jest.fn(),
}));

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma, runTransaction } from "@pathway/db";
const orgFindUnique = prisma.org.findUnique as unknown as jest.Mock;
const orgMembershipFindFirst = prisma.orgMembership
  .findFirst as unknown as jest.Mock;
const userOrgRoleFindFirst = prisma.userOrgRole
  .findFirst as unknown as jest.Mock;
const siteMembershipFindMany = prisma.siteMembership
  .findMany as unknown as jest.Mock;
const siteMembershipFindFirst = prisma.siteMembership
  .findFirst as unknown as jest.Mock;
const userTenantRoleFindFirst = prisma.userTenantRole
  .findFirst as unknown as jest.Mock;
const siteMembershipUpsert = prisma.siteMembership
  .upsert as unknown as jest.Mock;
const userFindUnique = prisma.user.findUnique as unknown as jest.Mock;
const userFindUniqueOrThrow = prisma.user
  .findUniqueOrThrow as unknown as jest.Mock;
const userFindMany = prisma.user.findMany as unknown as jest.Mock;
const staffUnavailableDateFindMany = prisma.staffUnavailableDate
  .findMany as unknown as jest.Mock;
const volunteerPreferenceFindMany = prisma.volunteerPreference
  .findMany as unknown as jest.Mock;
const transaction = prisma.$transaction as unknown as jest.Mock;
const runTransactionMock = runTransaction as jest.Mock;

describe("StaffService", () => {
  let service: StaffService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaffService();
  });

  it("allows availability editing for core orgs", async () => {
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });

    const result = await (
      service as unknown as {
        resolvePlanTier: (orgId: string) => Promise<boolean>;
      }
    ).resolvePlanTier("org_1");

    expect(result).toBe(true);
  });

  it("includes each user's email in getStaffForSessionAssignment rows, so staff who share a display name can be told apart", async () => {
    siteMembershipFindMany.mockResolvedValue([]);
    userFindMany
      .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]) // legacyUserIds lookup
      .mockResolvedValueOnce([
        {
          id: "u1",
          firstName: "Jean-Fidele",
          lastName: "Ntagengwa",
          name: null,
          displayName: null,
          email: "jean@personal.example",
        },
        {
          id: "u2",
          firstName: "Jean-Fidele",
          lastName: "Ntagengwa",
          name: null,
          displayName: null,
          email: "jean@work.example",
        },
      ]);
    staffUnavailableDateFindMany.mockResolvedValue([]);
    volunteerPreferenceFindMany.mockResolvedValue([]);

    const rows = await service.getStaffForSessionAssignment("tenant_1", {
      groupId: null,
      startsAt: new Date("2026-07-20T12:45:00Z"),
      endsAt: new Date("2026-07-20T13:30:00Z"),
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.email).sort()).toEqual([
      "jean@personal.example",
      "jean@work.example",
    ]);
  });

  it("accepts legacy full-day exceptions with default minute bounds", () => {
    const parsed = updateProfileDto.parse({
      unavailableDates: [{ date: "2026-07-20" }],
    });
    expect(parsed.unavailableDates).toEqual([
      { date: "2026-07-20", startMinute: 0, endMinute: 1440 },
    ]);
    expect(
      updateProfileDto.safeParse({ unavailableDates: [{ date: "2026-02-30" }] })
        .success,
    ).toBe(false);
  });

  it("rejects overlapping windows without replacing saved exceptions", async () => {
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });
    userFindUnique.mockResolvedValue({
      tenantId: "tenant_1",
      siteMemberships: [],
    });
    await expect(
      service.updateProfile("u1", "tenant_1", "org_1", {
        unavailableDates: [
          { date: "2026-07-20", startMinute: 600, endMinute: 720 },
          { date: "2026-07-20", startMinute: 660, endMinute: 780 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("replaces site-owned windows atomically and keeps adjacent windows", async () => {
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });
    userFindUnique.mockResolvedValue({
      tenantId: "tenant_1",
      siteMemberships: [],
    });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const queryRaw = jest.fn().mockResolvedValue([{ id: "u1" }]);
    transaction.mockImplementation((callback) =>
      callback({
        $queryRaw: queryRaw,
        staffUnavailableDate: { deleteMany, createMany },
      }),
    );
    jest
      .spyOn(service, "getById")
      .mockResolvedValue({} as Awaited<ReturnType<StaffService["getById"]>>);

    await service.updateProfile("u1", "tenant_1", "org_1", {
      unavailableDates: [
        { date: "2026-07-20", startMinute: 720, endMinute: 780 },
        { date: "2026-07-20", startMinute: 600, endMinute: 720 },
      ],
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", tenantId: "tenant_1" },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          tenantId: "tenant_1",
          date: new Date("2026-07-20T00:00:00.000Z"),
          startMinute: 600,
          endMinute: 720,
          reason: null,
        },
        {
          userId: "u1",
          tenantId: "tenant_1",
          date: new Date("2026-07-20T00:00:00.000Z"),
          startMinute: 720,
          endMinute: 780,
          reason: null,
        },
      ],
    });
  });

  it("blocks only staff whose unavailable window overlaps the session", async () => {
    siteMembershipFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValueOnce([{ id: "u1" }]).mockResolvedValueOnce([
      {
        id: "u1",
        firstName: "Alex",
        lastName: "Morgan",
        name: null,
        displayName: null,
        email: null,
      },
    ]);
    staffUnavailableDateFindMany.mockResolvedValue([
      {
        userId: "u1",
        date: new Date("2026-07-20T00:00:00.000Z"),
        startMinute: 780,
        endMinute: 840,
      },
    ]);
    volunteerPreferenceFindMany.mockResolvedValue([
      { userId: "u1", startMinute: 720, endMinute: 960 },
    ]);

    const overlapping = await service.getStaffForSessionAssignment("tenant_1", {
      groupId: null,
      startsAt: new Date("2026-07-20T12:45:00Z"),
      endsAt: new Date("2026-07-20T13:30:00Z"),
    });
    expect(overlapping[0]).toMatchObject({
      eligible: false,
      reason: "blocked_on_date",
    });

    userFindMany.mockResolvedValueOnce([{ id: "u1" }]).mockResolvedValueOnce([
      {
        id: "u1",
        firstName: "Alex",
        lastName: "Morgan",
        name: null,
        displayName: null,
        email: null,
      },
    ]);
    const outside = await service.getStaffForSessionAssignment("tenant_1", {
      groupId: null,
      startsAt: new Date("2026-07-20T14:00:00Z"),
      endsAt: new Date("2026-07-20T15:00:00Z"),
    });
    expect(outside[0]).toMatchObject({ eligible: true });
  });

  it("rejects a site-role change from a caller who is not an Organisation admin", async () => {
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });
    orgMembershipFindFirst.mockResolvedValue(null);
    userOrgRoleFindFirst.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({
      tenantId: "tenant_1",
      siteMemberships: [{ id: "sm_1" }],
    });

    await expect(
      service.update(
        "target_user",
        "tenant_1",
        "org_1",
        { role: "SITE_ADMIN" },
        "non_admin_caller",
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(siteMembershipUpsert).not.toHaveBeenCalled();
  });

  it("denies a non-manager's staff read and account change before accessing the target", async () => {
    userFindUnique.mockResolvedValue({ isActive: true });
    orgMembershipFindFirst.mockResolvedValue(null);
    userOrgRoleFindFirst.mockResolvedValue(null);
    siteMembershipFindFirst.mockResolvedValue(null);
    userTenantRoleFindFirst.mockResolvedValue(null);
    const read = jest.spyOn(service, "getById");

    await expect(
      service.getByIdForAdmin("target", "site", "org", "caller"),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.update("target", "site", "org", { isActive: false }, "caller"),
    ).rejects.toThrow(ForbiddenException);

    expect(read).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows a site leader to read staff but denies global account changes", async () => {
    userFindUnique.mockResolvedValue({
      isActive: true,
      tenantId: "site",
      siteMemberships: [],
    });
    orgMembershipFindFirst.mockResolvedValue(null);
    userOrgRoleFindFirst.mockResolvedValue(null);
    siteMembershipFindFirst.mockResolvedValue({ id: "manager" });
    userTenantRoleFindFirst.mockResolvedValue(null);
    const detail = {} as Awaited<ReturnType<StaffService["getById"]>>;
    jest.spyOn(service, "getById").mockResolvedValue(detail);

    await expect(
      service.getByIdForAdmin("target", "site", "org", "manager"),
    ).resolves.toBe(detail);
    await expect(
      service.update("target", "site", "org", { isActive: false }, "manager"),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("records an organisation admin's account disable in the same transaction", async () => {
    userFindUnique.mockResolvedValue({
      isActive: true,
      tenantId: "site",
      siteMemberships: [],
    });
    orgMembershipFindFirst.mockResolvedValue({ id: "org_admin" });
    userOrgRoleFindFirst.mockResolvedValue(null);
    siteMembershipFindFirst.mockResolvedValue(null);
    userTenantRoleFindFirst.mockResolvedValue(null);
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });
    const update = jest.fn().mockResolvedValue({ id: "target" });
    const audit = jest.fn().mockResolvedValue({ id: "audit" });
    runTransactionMock.mockImplementation((callback) =>
      callback({ user: { update }, auditEvent: { create: audit } }),
    );
    jest
      .spyOn(service, "getById")
      .mockResolvedValue({} as Awaited<ReturnType<StaffService["getById"]>>);

    await service.update(
      "target",
      "site",
      "org",
      { isActive: false },
      "org_admin",
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "target" },
      data: { isActive: false },
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "org_admin",
        entityId: "target",
        metadata: { kind: "STAFF_ACCOUNT_STATUS", action: "disable" },
      }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("only queries children from the selected site in a staff detail", async () => {
    userFindUnique
      .mockResolvedValueOnce({ tenantId: "site", siteMemberships: [] })
      .mockResolvedValueOnce({ children: [] });
    userFindUniqueOrThrow.mockResolvedValue({
      id: "target",
      firstName: "Alex",
      lastName: "Morgan",
      name: null,
      displayName: null,
      email: null,
      dateOfBirth: null,
      avatarUrl: null,
      avatarKey: null,
      avatarBytes: null,
      avatarContentType: null,
      isActive: true,
      hasServeAccess: false,
    });
    volunteerPreferenceFindMany.mockResolvedValue([]);
    staffUnavailableDateFindMany.mockResolvedValue([]);
    (prisma.staffPreferredGroup.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.siteMembership.findUnique as jest.Mock).mockResolvedValue(null);
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });

    await service.getById("target", "site", "org");

    expect(userFindUnique).toHaveBeenLastCalledWith({
      where: { id: "target" },
      select: {
        children: {
          where: { tenantId: "site" },
          select: expect.any(Object),
        },
      },
    });
  });
});
