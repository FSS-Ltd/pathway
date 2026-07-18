const orgVerticalFindUnique = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: { orgVertical: { findUnique: orgVerticalFindUnique } },
}));

import { getOrgVertical } from "../vertical";

describe("getOrgVertical", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the vertical when a row exists", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce({ vertical: "CHURCH" });
    const result = await getOrgVertical("org-1");
    expect(result).toBe("CHURCH");
    expect(orgVerticalFindUnique).toHaveBeenCalledWith({
      where: { orgId: "org-1" },
    });
  });

  it("returns null when no row exists", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce(null);
    const result = await getOrgVertical("org-1");
    expect(result).toBeNull();
  });
});
