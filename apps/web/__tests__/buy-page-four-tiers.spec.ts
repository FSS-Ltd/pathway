import { readFileSync } from "node:fs";
import path from "node:path";

describe("Buy page (target tiers and available add-ons)", () => {
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

  it("offers Storage and the Learning module without restoring removed add-ons", () => {
    const addonSelects = source.match(/<select/g) ?? [];
    // One select for storage and one for sector; Learning is a checkbox.
    expect(addonSelects.length).toBeLessThanOrEqual(2);
    expect(source).toContain("Learning module");
    expect(source).toContain('selectedModules: learningModule ? ["LEARNING"] : undefined');
    expect(source).not.toContain("Extra AV30");
    expect(source).not.toContain("SMS bundles");
  });
});
