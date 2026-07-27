import { config, DotenvConfigOptions } from "dotenv";
import path from "node:path";
import { execSync } from "node:child_process";

// Jest will call this once before running the e2e project
export default async function globalSetup(): Promise<void> {
  // 1) Load test env first, then fallback to root .env (quiet to suppress dotenv logs)
  config({
    path: path.resolve(__dirname, "../../.env.test"),
    override: true,
    quiet: true,
  } as DotenvConfigOptions);
  config({
    path: path.resolve(__dirname, "../../.env"),
    override: false,
    quiet: true,
  } as DotenvConfigOptions);

  // 2) Point Prisma at the dedicated E2E database
  if (!process.env.E2E_DATABASE_URL) {
    throw new Error("E2E_DATABASE_URL is not set (check .env.test)");
  }
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;

  // 3) Prepare schema ONCE per e2e run from reviewed migrations only.
  execSync(
    "pnpm --filter @pathway/db exec prisma migrate reset --force --skip-generate --skip-seed",
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PRISMA_IGNORE_ENV_FILE: "1",
        DATABASE_URL: process.env.DATABASE_URL!,
      },
    },
  );

  execSync("pnpm --filter @pathway/db exec prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      PRISMA_IGNORE_ENV_FILE: "1",
      DATABASE_URL: process.env.DATABASE_URL!,
    },
  });

  // Seed two tenants after migrations
  const { prisma } = await import("@pathway/db");
  try {
    const org = await prisma.org.upsert({
      where: { slug: "e2e-org" },
      update: { name: "E2E Org" },
      create: {
        slug: "e2e-org",
        name: "E2E Org",
        planCode: "trial",
        isSuite: false,
      },
    });
    process.env.E2E_ORG_ID = org.id;
    const tenantA = await prisma.tenant.upsert({
      where: { slug: "tenant-a-e2e" },
      update: { name: "Tenant A (e2e)" },
      create: {
        slug: "tenant-a-e2e",
        name: "Tenant A (e2e)",
        org: { connect: { id: org.id } },
      },
    });
    const tenantB = await prisma.tenant.upsert({
      where: { slug: "tenant-b-e2e" },
      update: { name: "Tenant B (e2e)" },
      create: {
        slug: "tenant-b-e2e",
        name: "Tenant B (e2e)",
        org: { connect: { id: org.id } },
      },
    });
    process.env.E2E_TENANT_ID = tenantA.id;
    process.env.E2E_TENANT2_ID = tenantB.id;
  } finally {
    await prisma.$disconnect();
  }
}
