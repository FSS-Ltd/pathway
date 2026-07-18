const orgModuleFindUnique = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: { orgModule: { findUnique: orgModuleFindUnique } },
}));

import { orgHasModule } from "../modules";

describe("orgHasModule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false when no row exists", async () => {
    orgModuleFindUnique.mockResolvedValueOnce(null);
    expect(await orgHasModule("org-1", "FINANCE")).toBe(false);
    expect(orgModuleFindUnique).toHaveBeenCalledWith({
      where: { orgId_module: { orgId: "org-1", module: "FINANCE" } },
    });
  });

  it("returns true for an ACTIVE row with no expiry", async () => {
    orgModuleFindUnique.mockResolvedValueOnce({
      status: "ACTIVE",
      expiresAt: null,
    });
    expect(await orgHasModule("org-1", "FINANCE")).toBe(true);
  });

  it("returns true for an ACTIVE row expiring in the future", async () => {
    orgModuleFindUnique.mockResolvedValueOnce({
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 1_000_000),
    });
    expect(await orgHasModule("org-1", "FINANCE")).toBe(true);
  });

  it("returns false for an ACTIVE row that expired in the past", async () => {
    orgModuleFindUnique.mockResolvedValueOnce({
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 1_000_000),
    });
    expect(await orgHasModule("org-1", "FINANCE")).toBe(false);
  });

  it("returns false for an EXPIRED row", async () => {
    orgModuleFindUnique.mockResolvedValueOnce({
      status: "EXPIRED",
      expiresAt: null,
    });
    expect(await orgHasModule("org-1", "FINANCE")).toBe(false);
  });
});
