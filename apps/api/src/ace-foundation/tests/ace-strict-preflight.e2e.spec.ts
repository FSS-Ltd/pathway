import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

    expect(output).toContain("tables have explicit RLS, retention, export");
  });

  it("fails when a required control classification is removed", () => {
    const root = resolve(__dirname, "../../../../..");
    const directory = mkdtempSync(resolve(tmpdir(), "ace-governance-"));
    const governancePath = resolve(directory, "governance.json");
    const governance = JSON.parse(
      readFileSync(
        resolve(root, "packages/db/ace-foundation-governance.json"),
        "utf8",
      ),
    ) as { groups: Array<{ controls: Record<string, string> }> };
    delete governance.groups[0]?.controls.auditEntity;
    writeFileSync(governancePath, JSON.stringify(governance));
    try {
      expect(() =>
        execFileSync(
          process.execPath,
          [resolve(root, "scripts/check-ace-foundation-governance.mjs")],
          {
            cwd: root,
            env: { ...process.env, ACE_GOVERNANCE_FILE: governancePath },
            encoding: "utf8",
            stdio: "pipe",
          },
        ),
      ).toThrow("ACE governance inventory incomplete");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
