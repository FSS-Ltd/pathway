import { PlanPreviewService } from "../plan-preview.service";

describe("PlanPreviewService", () => {
  let service: PlanPreviewService;

  beforeEach(() => {
    service = new PlanPreviewService();
  });

  it("returns base caps for Starter monthly with no add-ons", () => {
    const result = service.preview({ planCode: "STARTER_MONTHLY" });

    expect(result.planTier).toBe("starter");
    expect(result.base.av30Cap).toBe(50);
    expect(result.base.maxChildren).toBeNull();
    expect(result.base.maxSites).toBe(1);
    expect(result.effectiveCaps.av30Cap).toBe(50);
    expect(result.effectiveCaps.maxSites).toBe(1);
    expect(result.notes.source).toBe("plan_catalogue");
    expect(result.notes.warnings).toContain("price_not_included");
  });

  it("adds AV30 blocks for Growth monthly", () => {
    const result = service.preview({
      planCode: "GROWTH_MONTHLY",
      addons: { extraAv30Blocks: 2 },
    });

    expect(result.base.av30Cap).toBe(200);
    expect(result.addons.av30Cap).toBe(50); // 2 blocks * 25
    expect(result.addons.extraAv30Blocks).toBe(2);
    expect(result.effectiveCaps.av30Cap).toBe(250);
    expect(result.effectiveCaps.maxChildren).toBeNull();
    expect(result.notes.source).toBe("plan_catalogue");
  });

  it("returns core child cap in base and effective caps", () => {
    const result = service.preview({ planCode: "CORE_MONTHLY" });
    expect(result.planTier).toBe("core");
    expect(result.base.av30Cap).toBe(15);
    expect(result.base.maxChildren).toBe(50);
    expect(result.effectiveCaps.maxChildren).toBe(50);
  });

  it("handles unknown plan codes and uses add-ons only", () => {
    const result = service.preview({
      planCode: "UNKNOWN_CODE",
      addons: { extraAv30Blocks: 2 },
    });

    expect(result.planTier).toBeNull();
    expect(result.displayName).toBeNull();
    expect(result.base.av30Cap).toBeNull();
    expect(result.effectiveCaps.av30Cap).toBe(50);
    expect(result.notes.source).toBe("unknown_plan");
    expect(result.notes.warnings).toEqual(
      expect.arrayContaining([
        "plan_not_in_catalogue",
        "using_addons_only",
        "price_not_included",
      ]),
    );
  });

  it("normalises negative addon values to zero and warns", () => {
    const result = service.preview({
      planCode: "STARTER_MONTHLY",
      addons: { extraAv30Blocks: -1, extraSites: -2 },
    });

    expect(result.addons.av30Cap).toBeNull();
    expect(result.addons.maxSites).toBeNull();
    expect(result.effectiveCaps.av30Cap).toBe(50);
    expect(result.effectiveCaps.maxSites).toBe(1);
    expect(result.notes.warnings).toContain(
      "negative_addon_values_normalised_to_zero",
    );
  });

  it("blocks core capacity add-ons and returns warnings", () => {
    const result = service.preview({
      planCode: "CORE_MONTHLY",
      addons: { extraAv30Blocks: 2, extraSites: 1, extraStorageGb: 100 },
    });

    expect(result.effectiveCaps.av30Cap).toBe(15);
    expect(result.effectiveCaps.maxSites).toBe(1);
    expect(result.effectiveCaps.storageGbCap).toBe(100);
    expect(result.notes.warnings).toEqual(
      expect.arrayContaining([
        "core_capacity_addon_blocked_av30",
        "core_capacity_addon_blocked_sites",
      ]),
    );
  });
});
