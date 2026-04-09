import { StaffService } from "../staff.service";

jest.mock("@pathway/db", () => ({
  prisma: {
    org: { findUnique: jest.fn() },
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
});
