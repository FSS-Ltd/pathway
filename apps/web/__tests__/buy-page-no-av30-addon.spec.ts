import { readFileSync } from "node:fs";
import path from "node:path";

describe("Buy page (Phase 0 PR 0.4: AV30 add-on packs removed)", () => {
  it("no longer has an Active People add-on purchase input", () => {
    const source = readFileSync(
      path.join(__dirname, "../app/buy/page.tsx"),
      "utf8",
    );

    expect(source).not.toContain("av30Blocks");
    expect(source).not.toContain("AV30_BLOCK_25_MONTHLY");
    expect(source).not.toContain("Extra +50 Active People");
    expect(source).not.toContain("Extra +25 Active People");
  });
});
