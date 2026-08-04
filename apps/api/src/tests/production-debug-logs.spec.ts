import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const filesWithoutAdHocDebugLogs = [
  "src/auth/auth-user.guard.ts",
  "src/billing/billing.controller.ts",
  "src/billing/entitlements-enforcement.service.ts",
  "src/invites/invites.service.ts",
];

describe("production debug logging", () => {
  it.each(filesWithoutAdHocDebugLogs)(
    "%s does not contain ad-hoc console.log diagnostics",
    (filePath) => {
      const source = readFileSync(resolve(process.cwd(), filePath), "utf8");

      expect(source).not.toContain("console.log");
    },
  );

  it("does not write raw invite acceptance URLs to diagnostics", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/invites/invites.service.ts"),
      "utf8",
    );
    const consolePayloads =
      source.match(/console\.log\(\{[\s\S]*?\n\s*\}\);/g) ?? [];

    expect(consolePayloads.join("\n")).not.toContain("inviteUrl");
  });
});
