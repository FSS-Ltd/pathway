// Canonical Prisma bootstrap (ESM/CJS/Jest-safe)
import { PrismaClient, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { withPiiEncryption } from "./pii-encryption";

// Keep a single PrismaClient instance across hot-reloads in dev/test
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };
const prismaContext = new AsyncLocalStorage<Prisma.TransactionClient>();

export const transactionOptions = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

const rawPrismaClient: PrismaClient =
  globalForPrisma.__prisma ?? new PrismaClient({ transactionOptions });

// Transparent field-level encryption for sensitive PII columns (see pii-encryption.ts).
// Applied to the base client so it also covers $transaction/withTenantRlsContext.
const basePrismaClient: PrismaClient = withPiiEncryption(rawPrismaClient);

const prismaProxy = new Proxy(basePrismaClient, {
  get(target, prop, receiver) {
    const activeClient = prismaContext.getStore();
    const resolved = activeClient ?? target;
    const value = Reflect.get(resolved, prop, receiver);
    if (typeof value === "function") {
      return value.bind(resolved);
    }
    return value;
  },
});

export const prisma = prismaProxy as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = rawPrismaClient;
}

// Small helper so test teardown (or scripts) can cleanly disconnect
export async function closePrisma() {
  await basePrismaClient.$disconnect();
}

/**
 * Utility for e2e/unit tests: truncate all tables and reset identity sequences.
 * Uses CASCADE, so order is resilient to FK graphs.
 * IMPORTANT: keep this in sync with Prisma schema when new tables are added.
 */
export async function resetDatabase() {
  // Note: double-quote names to preserve case; include new suite/billing tables.
  // Postgres TRUNCATE with CASCADE clears dependents (junctions) safely.
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "BillingEvent",
        "PendingOrder",
        "UsageCounters",
        "StaffActivity",
        "ReportBundle",
        "Evidence",
        "LearningLog",
        "Subject",
        "OrgEntitlementSnapshot",
        "Subscription",
        "Announcement",
        "Lesson",
        "VolunteerPreference",
        "SwapRequest",
        "Assignment",
        "Attendance",
        "Session",
        "ChildNote",
        "Concern",
        "ChildGuardianContact",
        "Child",
        "Group",
        "SiteMembership",
        "OrgMembership",
        "UserIdentity",
        "UserTenantRole",
        "UserOrgRole",
        "User",
        "EmergencyContact",
        "ParentSignupConsent",
        "PublicSignupLink",
        "Tenant",
        "OrgVertical",
        "OrgModule",
        "Org"
      RESTART IDENTITY CASCADE
    `);
  } catch {
    // Fallback for environments where the current DB user cannot truncate billing tables.
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "UsageCounters",
        "StaffActivity",
        "OrgEntitlementSnapshot",
        "ReportBundle",
        "Evidence",
        "LearningLog",
        "Subject",
        "PendingOrder",
        "Subscription",
        "Announcement",
        "Lesson",
        "VolunteerPreference",
        "SwapRequest",
        "Assignment",
        "Attendance",
        "Session",
        "ChildNote",
        "Concern",
        "ChildGuardianContact",
        "Child",
        "Group",
        "SiteMembership",
        "OrgMembership",
        "UserIdentity",
        "UserTenantRole",
        "UserOrgRole",
        "User",
        "EmergencyContact",
        "ParentSignupConsent",
        "PublicSignupLink",
        "Tenant",
        "OrgVertical",
        "OrgModule",
        "Org"
      RESTART IDENTITY CASCADE
    `);
  }
}

// Re-export types & enums (public API unchanged)
export type { PrismaClient as PrismaClientType } from "@prisma/client";
export {
  AssignmentStatus,
  Role,
  Weekday,
  SwapStatus,
  SubscriptionStatus,
  BillingProvider,
  PendingOrderStatus,
  OrgRole,
  SiteRole,
  StaffAttendanceStatus,
  ChildGuardianContactType,
  OrgSector,
  Vertical,
  Module,
  ModuleStatus,
  ReportBundleStatus,
} from "@prisma/client";
export { Prisma };

async function applyTenantContext(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orgId?: string | null,
) {
  await tx.$executeRawUnsafe(
    `SELECT set_config('app.tenant_id', $1, true)`,
    tenantId,
  );
  const orgValue = orgId ?? "";
  await tx.$executeRawUnsafe(
    `SELECT set_config('app.org_id', $1, true)`,
    orgValue,
  );
  await tx.$executeRawUnsafe(`SET LOCAL row_security = on`);
}

/**
 * Run an interactive transaction using the base Prisma client.
 * Use this when prisma.$transaction fails (e.g. with the Proxy in some environments).
 */
export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return basePrismaClient.$transaction(fn);
}

export async function withTenantRlsContext<T>(
  tenantId: string,
  orgId: string | null,
  callback: (client: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenantRlsContext requires a tenantId");
  }

  return basePrismaClient.$transaction(async (tx) => {
    await applyTenantContext(tx, tenantId, orgId);
    return prismaContext.run(tx, () => callback(tx));
  });
}
