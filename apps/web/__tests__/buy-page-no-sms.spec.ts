import { readFileSync } from "node:fs";
import path from "node:path";

describe("Buy page (Phase 0 PR 0.3: SMS add-on removed)", () => {
  it("no longer has an SMS bundles purchase input", () => {
    const source = readFileSync(
      path.join(__dirname, "../app/buy/page.tsx"),
      "utf8",
    );

    expect(source).not.toContain("smsBundles");
    expect(source).not.toContain("SMS_1000_MONTHLY");
    expect(source).not.toContain("SMS bundles");
  });
});
