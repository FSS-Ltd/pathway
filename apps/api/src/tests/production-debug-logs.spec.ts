import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const filesWithoutAdHocDebugLogs = [
  "src/auth/active-site.service.ts",
  "src/billing/billing.controller.ts",
  "src/billing/entitlements-enforcement.service.ts",
];

describe("production debug logging", () => {
  it.each(filesWithoutAdHocDebugLogs)(
    "%s does not contain ad-hoc console.log diagnostics",
    (filePath) => {
      const source = readFileSync(resolve(process.cwd(), filePath), "utf8");

      expect(source).not.toContain("console.log");
    },
  );
});
