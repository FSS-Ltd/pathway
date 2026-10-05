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

const apiRuntimeEnv = readFileSync(
  path.resolve(process.cwd(), "../../apps/api/src/config/runtime-env.ts"),
  "utf8",
);

const vercelEnvSyncScript = readFileSync(
  path.resolve(process.cwd(), "../../scripts/sync-vercel-env.mjs"),
  "utf8",
);

const githubSecretsScript = readFileSync(
  path.resolve(process.cwd(), "../../scripts/setup-github-actions-secrets.mjs"),
  "utf8",
);

const scheduledWorkersWorkflow = readFileSync(
  path.resolve(process.cwd(), "../../.github/workflows/workers-scheduled.yml"),
  "utf8",
);
const databaseDeployWorkflow = readFileSync(
  path.resolve(process.cwd(), "../../.github/workflows/db-deploy.yml"),
  "utf8",
);
const productionDeployWorkflow = readFileSync(
  path.resolve(process.cwd(), "../../.github/workflows/deploy.yml"),
  "utf8",
);

describe("deploy workflow contract", () => {
  it("runs deploy-time package tests with the CI heap budget", () => {
    expect(ciWorkflow).toContain("NODE_OPTIONS: --max-old-space-size=4096");
    expect(deployAction).toMatch(
      /- name: Unit tests\s+shell: bash\s+env:\s+NODE_OPTIONS: --max-old-space-size=4096\s+run: pnpm --filter \$\{\{ inputs\.package \}\} test/,
    );
  });

  it("validates the migration endpoint before running Prisma", () => {
    expect(databaseDeployWorkflow).toContain(
      "DATABASE_URL: ${{ secrets.DIRECT_URL }}",
    );
    expect(databaseDeployWorkflow).toContain(
      "SUPABASE_URL: ${{ secrets.SUPABASE_URL }}",
    );
    expect(databaseDeployWorkflow).toContain(
      "node scripts/validate-prisma-migration-url.mjs",
    );
  });

  it("requires manual dispatch for production deployment", () => {
    expect(productionDeployWorkflow).toContain("workflow_dispatch:");
    expect(productionDeployWorkflow).not.toMatch(/^\s+push:\s*$/m);
    expect(productionDeployWorkflow).not.toContain(
      "github.event_name == 'push'",
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

  it("syncs API production bootstrap secrets to Vercel", () => {
    const apiProductionRequiredEnv = Array.from(
      apiRuntimeEnv.matchAll(/"([A-Z0-9_]+)"/g),
      ([, envKey]) => envKey,
    );
    const apiSyncSection = vercelEnvSyncScript.match(
      /api:\s*\{[\s\S]*?keys:\s*\[([\s\S]*?)\],\s*\},/,
    )?.[1];

    expect(apiSyncSection).toBeDefined();
    expect(apiProductionRequiredEnv).toContain("BEHAVIOUR_OUTBOX_SECRET");
    expect(apiSyncSection).toContain('"BEHAVIOUR_OUTBOX_SECRET"');
  });

  it("manages every Scheduled workers secret in the GitHub secret setup helper", () => {
    const scheduledWorkerSecrets = Array.from(
      scheduledWorkersWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/g),
      ([, secretName]) => secretName,
    );
    const githubSecretNames = Array.from(
      githubSecretsScript.matchAll(/"([A-Z0-9_]+)"/g),
      ([, secretName]) => secretName,
    );

    for (const secretName of scheduledWorkerSecrets) {
      expect(githubSecretNames).toContain(secretName);
    }
  });
});
