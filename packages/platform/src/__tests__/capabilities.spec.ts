const orgVerticalFindUnique = jest.fn();
const orgModuleFindMany = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    orgVertical: { findUnique: orgVerticalFindUnique },
    orgModule: { findMany: orgModuleFindMany },
  },
}));

import { getOrgCapabilities, orgHasCapability } from "../capabilities";
import { MODULE_CAPABILITIES, VERTICAL_CAPABILITIES } from "../capability-maps";

describe("getOrgCapabilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes core Learning even when there is no vertical or module grant", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce(null);
    orgModuleFindMany.mockResolvedValueOnce([]);
    expect(await getOrgCapabilities("org-1")).toEqual(
      MODULE_CAPABILITIES.LEARNING,
    );
  });

  it("returns the vertical's capabilities when only a vertical is set", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce({ vertical: "CHURCH" });
    orgModuleFindMany.mockResolvedValueOnce([]);
    const caps = await getOrgCapabilities("org-1");
    expect(caps).toContain("giving.manage");
  });

  it("returns ACE's Learning subset without a Learning module", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce({ vertical: "ACE_SCHOOL" });
    orgModuleFindMany.mockResolvedValueOnce([]);

    expect(await getOrgCapabilities("org-1")).toEqual(
      expect.arrayContaining([
        "learning.log.read",
        "learning.log.write",
        "learning.evidence.read",
        "learning.evidence.write",
        "learning.reports.generate",
      ]),
    );
  });

  it("queries only ACTIVE modules", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce(null);
    orgModuleFindMany.mockResolvedValueOnce([]);
    await getOrgCapabilities("org-1");
    expect(orgModuleFindMany).toHaveBeenCalledWith({
      where: { orgId: "org-1", status: "ACTIVE" },
    });
  });

  it("excludes an ACTIVE module whose expiresAt is in the past", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce(null);
    orgModuleFindMany.mockResolvedValueOnce([
      { module: "FINANCE", expiresAt: new Date(Date.now() - 1_000_000) },
    ]);
    expect(await getOrgCapabilities("org-1")).toEqual(
      MODULE_CAPABILITIES.LEARNING,
    );
  });

  it("returns a deduped union of vertical + active module capabilities", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce({ vertical: "CHURCH" });
    orgModuleFindMany.mockResolvedValueOnce([
      { module: "FINANCE", expiresAt: null },
      { module: "EVENTS", expiresAt: new Date(Date.now() + 1_000_000) },
    ]);
    const caps = await getOrgCapabilities("org-1");
    expect(new Set(caps).size).toBe(caps.length);
    expect(caps).toEqual(
      expect.arrayContaining([
        "giving.manage",
        "finance.invoices",
        "events.booking",
      ]),
    );
  });

  it("uses an injected operational reader when one is provided", async () => {
    const reader = {
      orgVertical: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ vertical: "ACE_SCHOOL" as const }),
      },
      orgModule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    await expect(
      getOrgCapabilities("org-operational", reader),
    ).resolves.toContain("ace.behaviour.read");
    expect(reader.orgVertical.findUnique).toHaveBeenCalledWith({
      where: { orgId: "org-operational" },
    });
    expect(reader.orgModule.findMany).toHaveBeenCalledWith({
      where: { orgId: "org-operational", status: "ACTIVE" },
    });
    expect(orgVerticalFindUnique).not.toHaveBeenCalled();
    expect(orgModuleFindMany).not.toHaveBeenCalled();
  });
});

describe("orgHasCapability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when the capability is in the org's set", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce({ vertical: "CHURCH" });
    orgModuleFindMany.mockResolvedValueOnce([]);
    expect(await orgHasCapability("org-1", "giving.manage")).toBe(true);
  });

  it("returns false when the capability is not in the org's set", async () => {
    orgVerticalFindUnique.mockResolvedValueOnce(null);
    orgModuleFindMany.mockResolvedValueOnce([]);
    expect(await orgHasCapability("org-1", "finance.invoices")).toBe(false);
  });
});

describe("institutional compliance entitlements", () => {
  it("includes institutional compliance without granting it to Home", () => {
    for (const [vertical, capabilities] of Object.entries(
      VERTICAL_CAPABILITIES,
    )) {
      for (const permission of [
        "compliance.checks.read",
        "compliance.tracker.read",
        "compliance.tracker.manage",
        "compliance.checks.manage",
        "compliance.medical.read",
        "compliance.medical.manage",
        "compliance.agreements.read",
        "compliance.agreements.manage",
      ]) {
        expect((capabilities as readonly string[]).includes(permission)).toBe(
          vertical !== "HOME_EDUCATION",
        );
      }
    }
    for (const capabilities of Object.values(MODULE_CAPABILITIES)) {
      expect(capabilities).not.toContain("compliance.checks.read");
      expect(capabilities).not.toContain("compliance.tracker.read");
      expect(capabilities).not.toContain("compliance.tracker.manage");
      expect(capabilities).not.toContain("compliance.checks.manage");
      expect(capabilities).not.toContain("compliance.medical.read");
      expect(capabilities).not.toContain("compliance.medical.manage");
      expect(capabilities).not.toContain("compliance.agreements.read");
      expect(capabilities).not.toContain("compliance.agreements.manage");
    }
  });
});
