import { Prisma } from "@pathway/db";

const SETTINGS_WRITE_LOCK_PREFIX = "ace-settings";

export async function acquireAceSettingsWriteLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${SETTINGS_WRITE_LOCK_PREFIX}:${tenantId}`}, 0)
      )
    `,
  );
}

/**
 * Keeps commands that consume the current settings snapshot concurrent with
 * each other while serialising them against a settings writer.
 */
export async function acquireAceSettingsReadLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`
      SELECT pg_advisory_xact_lock_shared(
        hashtextextended(${`${SETTINGS_WRITE_LOCK_PREFIX}:${tenantId}`}, 0)
      )
    `,
  );
}
