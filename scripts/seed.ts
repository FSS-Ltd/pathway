import {
  assertSystemRoleSeedIdentity,
  closePrisma,
  PrismaClient,
  prisma,
  seedSystemRoles,
} from "@pathway/db";
import { SYSTEM_ROLE_TEMPLATES } from "../packages/auth/src/access/system-role-templates";
import { seedDemoData } from "../packages/db/prisma/seed";
import { getOrgCapabilities } from "../packages/platform/src/capabilities";
import { syncPermissionDefinitions } from "../packages/platform/src/permission-definition-sync";

function getSystemRoleSeedDatabaseUrl(): string {
  const databaseUrl = process.env.SYSTEM_ROLE_SEED_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "SYSTEM_ROLE_SEED_DATABASE_URL is required for protected system-role seeding",
    );
  }
  return databaseUrl;
}

export async function runDatabaseSeed(): Promise<void> {
  const systemRoleSeedClient = new PrismaClient({
    datasources: { db: { url: getSystemRoleSeedDatabaseUrl() } },
  });
  try {
    await assertSystemRoleSeedIdentity(systemRoleSeedClient);
    await systemRoleSeedClient.$transaction(syncPermissionDefinitions);
    await seedDemoData(prisma);
    const result = await seedSystemRoles(
      systemRoleSeedClient,
      SYSTEM_ROLE_TEMPLATES,
      (orgId, tx) => getOrgCapabilities(orgId, tx),
    );
    console.log(
      `[system-roles] processed ${result.rolesProcessed} roles and ${result.permissionsProcessed} grants`,
    );
  } finally {
    await systemRoleSeedClient.$disconnect();
  }
}

runDatabaseSeed()
  .catch((error: unknown) => {
    console.error("❌ Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(closePrisma);
