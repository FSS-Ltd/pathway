import {
  closePrisma,
  prisma,
  runTransaction,
  seedSystemRoles,
} from "@pathway/db";
import { SYSTEM_ROLE_TEMPLATES } from "../packages/auth/src/access/system-role-templates";
import { seedDemoData } from "../packages/db/prisma/seed";
import { getOrgCapabilities } from "../packages/platform/src/capabilities";
import { syncPermissionDefinitions } from "../packages/platform/src/permission-definition-sync";

async function main(): Promise<void> {
  await runTransaction(syncPermissionDefinitions);
  await seedDemoData(prisma);
  const result = await runTransaction((tx) =>
    seedSystemRoles(tx, SYSTEM_ROLE_TEMPLATES, getOrgCapabilities),
  );
  console.log(
    `[system-roles] processed ${result.rolesProcessed} roles and ${result.permissionsProcessed} grants`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("❌ Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(closePrisma);
