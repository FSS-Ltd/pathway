import { readFileSync } from "node:fs";
import path from "node:path";

describe("Marketing pricing page (Phase 0 PR 0.5: four target tiers)", () => {
  const source = readFileSync(
    path.join(__dirname, "../app/(marketing)/pricing/page.tsx"),
    "utf8",
  );

  it("displays the four target-tier plan codes", () => {
    expect(source).toContain("STARTER_49_MONTHLY");
    expect(source).toContain("GROWTH_99_MONTHLY");
    expect(source).toContain("PROFESSIONAL_149_MONTHLY");
    expect(source).toContain("ENTERPRISE_CONTACT");
  });

  it("no longer shows a Core card", () => {
    expect(source).not.toContain("CORE_MONTHLY");
    expect(source).not.toContain("CORE_YEARLY");
    expect(source).not.toContain("Core Card");
  });

  it("lists the Learning module as a purchasable add-on", () => {
    expect(source).toContain("Learning module");
    expect(source).toContain("MODULE_LEARNING_MONTHLY");
    expect(source).toContain("MODULE_LEARNING_YEARLY");
  });
});
