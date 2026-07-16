import { StaffService } from "../staff.service";

jest.mock("@pathway/db", () => ({
  prisma: {
    org: { findUnique: jest.fn() },
    siteMembership: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    staffUnavailableDate: { findMany: jest.fn() },
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
}));

import { prisma } from "@pathway/db";
const orgFindUnique = prisma.org.findUnique as unknown as jest.Mock;
const siteMembershipFindMany = prisma.siteMembership.findMany as unknown as jest.Mock;
const userFindMany = prisma.user.findMany as unknown as jest.Mock;
const staffUnavailableDateFindMany =
  prisma.staffUnavailableDate.findMany as unknown as jest.Mock;
const volunteerPreferenceFindMany =
  prisma.volunteerPreference.findMany as unknown as jest.Mock;

describe("StaffService", () => {
  let service: StaffService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaffService();
  });

  it("allows availability editing for core orgs", async () => {
    orgFindUnique.mockResolvedValue({ isMasterOrg: false });

    const result = await (service as unknown as { resolvePlanTier: (orgId: string) => Promise<boolean> }).resolvePlanTier("org_1");

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
});
