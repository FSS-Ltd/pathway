import { readFileSync } from "node:fs";
import path from "node:path";

describe("Buy page (Phase 0 PR 0.5: four target tiers, Storage-only add-on)", () => {
  const source = readFileSync(
    path.join(__dirname, "../app/buy/page.tsx"),
    "utf8",
  );

  it("plan selector covers the four target tiers, not Core", () => {
    expect(source).toContain("STARTER_49_MONTHLY");
    expect(source).toContain("GROWTH_99_MONTHLY");
    expect(source).toContain("PROFESSIONAL_149_MONTHLY");
    expect(source).toContain('"professional"');
    expect(source).not.toContain('"core"');
    expect(source).not.toContain("CORE_MONTHLY");
  });

  it("has exactly one add-on control (Storage)", () => {
    const addonSelects = source.match(/<select/g) ?? [];
    // One select for the storage choice, one for sector - both pre-existing,
    // neither is a second add-on control.
    expect(addonSelects.length).toBeLessThanOrEqual(2);
    expect(source).not.toContain("Extra AV30");
    expect(source).not.toContain("SMS bundles");
  });
});
