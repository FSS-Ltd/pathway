import { readFileSync } from "node:fs";
import path from "node:path";

const ciWorkflow = readFileSync(
  path.resolve(process.cwd(), "../../.github/workflows/ci.yml"),
  "utf8",
);

const deployAction = readFileSync(
  path.resolve(
    process.cwd(),
    "../../.github/actions/deploy-vercel-app/action.yml",
  ),
  "utf8",
);

const rootPackageJson = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "../../package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const prismaProductionScript = readFileSync(
  path.resolve(process.cwd(), "../../scripts/prisma-production.mjs"),
  "utf8",
);

describe("deploy workflow contract", () => {
  it("runs deploy-time package tests with the CI heap budget", () => {
    expect(ciWorkflow).toContain("NODE_OPTIONS: --max-old-space-size=4096");
    expect(deployAction).toMatch(
      /- name: Unit tests\s+shell: bash\s+env:\s+NODE_OPTIONS: --max-old-space-size=4096\s+run: pnpm --filter \$\{\{ inputs\.package \}\} test/,
    );
  });

  it("does not call deleted root package scripts during production migration deploys", () => {
    const directRootScriptCalls = Array.from(
      prismaProductionScript.matchAll(/runPnpm\(\["([^"-][^"]*)"\]\)/g),
      ([, scriptName]) => scriptName,
    );

    expect(directRootScriptCalls).toEqual(
      directRootScriptCalls.filter((scriptName) =>
        Object.hasOwn(rootPackageJson.scripts ?? {}, scriptName),
      ),
    );
  });
});
