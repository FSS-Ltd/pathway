import { prisma, type Prisma } from "@pathway/db";

const TRIGGER = '"OrgRoleDefinition_protect_system_template"';

/** Allows disposable integration fixtures to model fixed roles without changing production seeding. */
export async function withSystemRoleFixtureWrites<T>(
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/pathway_test_e2e") {
    throw new Error("System-role fixtures require the disposable E2E database");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `ALTER TABLE "OrgRoleDefinition" DISABLE TRIGGER ${TRIGGER}`,
    );
    const result = await write(tx);
    await tx.$executeRawUnsafe(
      `ALTER TABLE "OrgRoleDefinition" ENABLE TRIGGER ${TRIGGER}`,
    );
    return result;
  });
}
