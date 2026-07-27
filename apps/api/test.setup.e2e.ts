/// <reference types="jest" />
import { config } from "dotenv";
import path from "node:path";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "@pathway/db";

// E2E tests can be slow (DB, HTTP); set default timeout
if (typeof jest !== "undefined") {
  jest.setTimeout(30000);
}

const usesGlobalSetup = process.env.E2E_USE_GLOBAL_SETUP === "true";

// 1) Load test env first, then fallback to root .env
config({
  path: path.resolve(__dirname, "../../.env.test"),
  override: !usesGlobalSetup,
});
config({ path: path.resolve(__dirname, "../../.env"), override: false });

// 2) Point Prisma at the dedicated E2E database (prefer TEST_DATABASE_URL if provided)
const BASE_E2E_URL =
  process.env.E2E_USE_GLOBAL_SETUP === "true"
    ? process.env.E2E_DATABASE_URL
    : (process.env.TEST_DATABASE_URL ?? process.env.E2E_DATABASE_URL);

if (!BASE_E2E_URL) {
  throw new Error(
    "TEST_DATABASE_URL (preferred) or E2E_DATABASE_URL must be set for e2e tests",
  );
}
// Keep E2E_DATABASE_URL aligned so downstream helpers/logging reflect the actual URL
process.env.E2E_DATABASE_URL = BASE_E2E_URL;
// Per-worker schemas have been flaky under the current DB user permissions.
// Re-use the schema from the base URL if present, otherwise default to public.
const parsedBaseUrl = new URL(BASE_E2E_URL);
const baseSchema = parsedBaseUrl.searchParams.get("schema");
const E2E_SCHEMA = baseSchema ?? "public";

function withSchema(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.delete("schema");
  parsed.searchParams.append("schema", schema);
  return parsed.toString();
}

function logDbUrl(label: string, rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const dbName = parsed.pathname.replace(/^\//, "") || "<default>";
    console.log(
      `[test.setup.e2e] ${label}: user=${parsed.username || "n/a"} host=${
        parsed.host
      } db=${dbName} schema=${parsed.searchParams.get("schema") ?? "default"}`,
    );
  } catch (error) {
    console.warn(
      `[test.setup.e2e] ${label}: failed to parse DATABASE_URL`,
      error,
    );
  }
}

logDbUrl("Base URL", BASE_E2E_URL);
const workerUrl = withSchema(BASE_E2E_URL, E2E_SCHEMA);
logDbUrl("Worker URL", workerUrl);
process.env.DATABASE_URL = workerUrl;

// Pre-set deterministic tenant IDs in env so specs can read them at module load time
const TENANT_A_ID = process.env.E2E_TENANT_ID ?? randomUUID();
const TENANT_B_ID = process.env.E2E_TENANT2_ID ?? randomUUID();
// We'll finalize these after we check for existing slugs in the DB
process.env.E2E_TENANT_ID = TENANT_A_ID;
process.env.E2E_TENANT2_ID = TENANT_B_ID;
const E2E_ORG_ID = process.env.E2E_ORG_ID ?? randomUUID();
process.env.E2E_ORG_ID = E2E_ORG_ID;
// Keep default slug stable to match e2e expectations; allow override via env.
const E2E_ORG_SLUG = process.env.E2E_ORG_SLUG ?? "e2e-org";
process.env.E2E_ORG_SLUG = E2E_ORG_SLUG;
const E2E_USER_ID = process.env.E2E_USER_ID ?? randomUUID();
process.env.E2E_USER_ID = E2E_USER_ID;

// Ensure the worker-local schema is in sync before we import the Prisma client
const allowReset = process.env.E2E_ALLOW_RESET === "true";
if (allowReset) {
  console.log(
    "[test.setup.e2e] E2E DB reset enabled via E2E_ALLOW_RESET=true; running prisma migrate reset.",
  );
  const resetUrl = process.env.SUPER_TEST_DATABASE ?? process.env.DATABASE_URL;
  if (!resetUrl) {
    throw new Error(
      "E2E_ALLOW_RESET=true but no DATABASE_URL/TEST_DATABASE_URL/SUPER_TEST_DATABASE set",
    );
  }
  try {
    execSync(
      "pnpm --filter @pathway/db exec prisma migrate reset --force --skip-seed --skip-generate",
      {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: resetUrl, // use elevated URL if provided
        },
      },
    );
  } catch (e2) {
    console.error(
      "[test.setup.e2e] prisma schema sync failed (continuing):",
      e2,
    );
  }
} else {
  console.log(
    "[test.setup.e2e] Skipping prisma migrate reset; assuming schema is pre-migrated. Set E2E_ALLOW_RESET=true to force a reset (requires privileged DB user).",
  );
}

let prisma: PrismaClientType | undefined;
// Global flag to track if database is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__E2E_DB_AVAILABLE = false;

beforeAll(async () => {
  // 3) Import prisma AFTER DATABASE_URL is set so the client binds to the E2E DB
  const db = await import("@pathway/db");
  const { prisma: client, withTenantRlsContext: runWithTenantContext } = db as {
    prisma: PrismaClientType;
    withTenantRlsContext: (typeof import("@pathway/db"))["withTenantRlsContext"];
  };
  prisma = client;

  // Quick smoke check: ensure the test role can read migrations metadata.
  try {
    await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__E2E_DB_AVAILABLE = true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      typeof error === "object" && error !== null && "errorCode" in error
        ? String((error as { errorCode?: unknown }).errorCode)
        : undefined;

    console.error(
      "[test.setup.e2e] Smoke check failed: cannot read _prisma_migrations. Ensure schema is migrated and test role has USAGE/SELECT grants.",
      {
        errorMessage,
        errorCode,
        error,
      },
    );

    // If it's a connection error (P1001), mark DB as unavailable but don't throw
    // Tests will skip gracefully
    if (
      errorCode === "P1001" ||
      errorMessage.includes("Can't reach database server")
    ) {
      console.warn(
        "[test.setup.e2e] Database server is not available. E2E tests will be skipped.",
      );
      return; // Exit early, skip seeding
    }

    // For other errors, still throw (e.g., permission errors)
    throw error;
  }

  // Only seed if database is available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).__E2E_DB_AVAILABLE) {
    return;
  }

  if (usesGlobalSetup) {
    console.log(
      "[test.setup.e2e] Global setup prepared migrations, registry metadata, and tenant fixtures.",
    );
    return;
  }

  // Permission definitions are platform-owned global metadata. Seed them through
  // the approved synchronizer using the test database's operational connection,
  // not a tenant RLS context or a customer-created fixture key.
  const { syncPermissionDefinitions } = await import("@pathway/platform");
  await db.runTransaction(syncPermissionDefinitions);

  // 4) Minimal deterministic seed for all e2e specs (clean DB per run)
  // Stable defaults to align with e2e expectations; override via env if needed
  const SLUG_A = process.env.E2E_TENANT_SLUG_A ?? "e2e-tenant-a";
  const SLUG_B = process.env.E2E_TENANT_SLUG_B ?? "e2e-tenant-b";

  // Create a test org using an org-scoped context (no tenant_id required for org policies)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.org_id', ${E2E_ORG_ID}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${E2E_USER_ID}, true)`;
    await tx.$executeRaw`SET LOCAL row_security = on`;

    await tx.org.upsert({
      where: { slug: E2E_ORG_SLUG },
      update: { name: "E2E Org" },
      create: {
        id: E2E_ORG_ID,
        slug: E2E_ORG_SLUG,
        name: "E2E Org",
        planCode: "trial",
        isSuite: false,
      },
    });
  });

  const tenantSeeds = [
    { id: TENANT_A_ID, slug: SLUG_A, name: "E2E Tenant A" },
    { id: TENANT_B_ID, slug: SLUG_B, name: "E2E Tenant B" },
  ];

  for (const seed of tenantSeeds) {
    await runWithTenantContext(seed.id, E2E_ORG_ID, async (tx) => {
      // Ensure app.user_id is present for RLS policies that expect it
      await tx.$executeRaw`SELECT set_config('app.user_id', ${E2E_USER_ID}, true)`;
      await tx.$executeRaw`SELECT set_config('app.org_id', ${E2E_ORG_ID}, true)`;

      await tx.tenant.upsert({
        where: { id: seed.id },
        update: { name: seed.name, orgId: E2E_ORG_ID, slug: seed.slug },
        create: {
          id: seed.id,
          slug: seed.slug,
          name: seed.name,
          org: { connect: { id: E2E_ORG_ID } },
        },
      });
    });
  }

  // Re-export the same IDs to env (for clarity; values are unchanged)
  process.env.E2E_TENANT_ID = TENANT_A_ID;
  process.env.E2E_TENANT2_ID = TENANT_B_ID;
});

afterAll(async () => {
  await prisma?.$disconnect();
});
