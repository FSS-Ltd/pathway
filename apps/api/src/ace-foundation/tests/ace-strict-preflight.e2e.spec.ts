import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("ACE strict foundation preflight", () => {
  it("rejects incomplete governance coverage before the launch gate runs", () => {
    const script = resolve(
      __dirname,
      "../../../../../scripts/check-ace-foundation-governance.mjs",
    );
    const output = execFileSync(process.execPath, [script], {
      cwd: resolve(__dirname, "../../../../.."),
      encoding: "utf8",
    });

    expect(output).toContain("57 tables have explicit");
  });
});
