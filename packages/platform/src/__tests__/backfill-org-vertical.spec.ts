const orgFindMany = jest.fn();
const orgVerticalUpsert = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    org: { findMany: orgFindMany },
    orgVertical: { upsert: orgVerticalUpsert },
  },
}));

import { backfillOrgVertical } from "../backfill-org-vertical";

describe("backfillOrgVertical", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("writes an OrgVertical row for each org with a mappable sector, skipping SCHOOL and null", async () => {
    orgFindMany.mockResolvedValueOnce([
      { id: "org-church", sector: "CHURCH" },
      { id: "org-club", sector: "CLUB" },
      { id: "org-charity", sector: "CHARITY" },
      { id: "org-school", sector: "SCHOOL" },
      { id: "org-null", sector: null },
    ]);

    const result = await backfillOrgVertical();

    expect(result).toEqual({ written: 3, skipped: 2 });
    expect(orgVerticalUpsert).toHaveBeenCalledTimes(3);
    expect(orgVerticalUpsert).toHaveBeenCalledWith({
      where: { orgId: "org-church" },
      create: { orgId: "org-church", vertical: "CHURCH" },
      update: {},
    });
    expect(orgVerticalUpsert).toHaveBeenCalledWith({
      where: { orgId: "org-club" },
      create: { orgId: "org-club", vertical: "CLUB" },
      update: {},
    });
    expect(orgVerticalUpsert).toHaveBeenCalledWith({
      where: { orgId: "org-charity" },
      create: { orgId: "org-charity", vertical: "CHARITY" },
      update: {},
    });
  });
});
