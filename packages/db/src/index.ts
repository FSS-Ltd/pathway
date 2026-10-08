// Canonical Prisma bootstrap (ESM/CJS/Jest-safe)
import { PrismaClient, Prisma } from "@prisma/client";
import {
  withPiiEncryption,
  withPiiEncryptionTransaction,
} from "./pii-encryption";
import {
  activeTransaction,
  assertCompatibleScope,
  runWithTransaction,
  type TransactionScope,
} from "./transaction-context";

export * from "./permission-definition-sync";
export * from "./seed-system-roles";

// Keep a single PrismaClient instance across hot-reloads in dev/test
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const transactionOptions = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

const rawPrismaClient: PrismaClient =
  globalForPrisma.__prisma ?? new PrismaClient({ transactionOptions });

// Transparent field-level encryption for sensitive PII columns (see pii-encryption.ts).
// Interactive transactions are wrapped separately because Prisma does not expose
// `$extends` on their transaction client.
const basePrismaClient: PrismaClient = withPiiEncryption(rawPrismaClient);

const prismaProxy = new Proxy(basePrismaClient, {
  get(target, prop, receiver) {
    const activeClient = activeTransaction()?.client;
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
        "OutboxEvent",
        "UserRoleAssignment",
        "OrgRolePermission",
        "OrgRoleRevision",
        "OrgRoleDefinition",
        "PermissionDefinition",
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
        "AttendanceCorrectionEvent",
        "AceDailyAttendanceCorrectionEvent",
        "AceDailyAttendance",
        "Attendance",
        "AceStaffYearBandAssignment",
        "AceSchoolEnrollment",
        "AceTeachingDate",
        "AceYearBand",
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
        "OutboxEvent",
        "UserRoleAssignment",
        "OrgRolePermission",
        "OrgRoleRevision",
        "OrgRoleDefinition",
        "PermissionDefinition",
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
        "AttendanceCorrectionEvent",
        "AceDailyAttendanceCorrectionEvent",
        "AceDailyAttendance",
        "Attendance",
        "AceStaffYearBandAssignment",
        "AceSchoolEnrollment",
        "AceTeachingDate",
        "AceYearBand",
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
  PrismaClient,
  AssignmentStatus,
  Role,
  Weekday,
  SwapStatus,
  SubscriptionStatus,
  BillingProvider,
  PendingOrderStatus,
  OrgRole,
  SiteRole,
  AttendanceStatus,
  AceDailyAbsenceReason,
  AttendanceCorrectionOrigin,
  StaffAttendanceStatus,
  ChildGuardianContactType,
  OrgSector,
  Vertical,
  Module,
  ModuleStatus,
  ReportBundleStatus,
  RoleScope,
} from "@prisma/client";
export { Prisma };
export {
  roleScopeAcceptsPermissionScope,
  type CompatibleRoleScope,
  type RolePermissionScope,
} from "./role-scope-compatibility";

export async function applyTenantContext(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orgId?: string | null,
) {
  const active = activeTransaction();
  if (active) {
    if (active.client !== tx) {
      throw new Error("Cannot set RLS on a second active database transaction");
    }
    const requested: TransactionScope = tenantId
      ? { kind: "tenant", tenantId, orgId: orgId ?? null, readOnly: false }
      : {
          kind: "org",
          orgId: orgId ?? "",
          readOnly: active.scope.readOnly,
        };
    assertCompatibleScope(active, requested);
  }
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
 * Join the active writable request transaction, or create one when none exists.
 * A nested callback participates in the outer transaction's rollback boundary.
 */
export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const active = activeTransaction();
  if (active) {
    if (active.scope.readOnly) {
      throw new Error("Cannot write inside a read-only database transaction");
    }
    return fn(active.client);
  }
  return basePrismaClient.$transaction((tx) =>
    fn(withPiiEncryptionTransaction(tx)),
  );
}

/** Bind Prisma proxy reads to an existing transaction; the caller sets its RLS context. */
export function withPrismaTransactionContext<T>(
  tx: Prisma.TransactionClient,
  operation: () => Promise<T>,
  scope: TransactionScope = { kind: "unscoped", readOnly: false },
): Promise<T> {
  return runWithTransaction({ client: tx, scope }, operation);
}

export async function runReadOnlyTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const active = activeTransaction();
  if (active) {
    if (!active.scope.readOnly) {
      throw new Error(
        "Cannot start a read-only transaction inside a write transaction",
      );
    }
    return fn(active.client);
  }
  return basePrismaClient.$transaction(async (tx) => {
    const encryptedTx = withPiiEncryptionTransaction(tx);
    await encryptedTx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return runWithTransaction(
      { client: encryptedTx, scope: { kind: "unscoped", readOnly: true } },
      () => fn(encryptedTx),
    );
  });
}

export async function withTenantRlsContext<T>(
  tenantId: string,
  orgId: string | null,
  callback: (client: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenantRlsContext requires a tenantId");
  }

  const scope: TransactionScope = {
    kind: "tenant",
    tenantId,
    orgId,
    readOnly: false,
  };
  const active = activeTransaction();
  if (active) {
    assertCompatibleScope(active, scope);
    return callback(active.client);
  }

  return basePrismaClient.$transaction(async (tx) => {
    const encryptedTx = withPiiEncryptionTransaction(tx);
    await applyTenantContext(encryptedTx, tenantId, orgId);
    return runWithTransaction({ client: encryptedTx, scope }, () =>
      callback(encryptedTx),
    );
  });
}

export async function withOrgRlsContext<T>(
  orgId: string,
  callback: (client: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!orgId) {
    throw new Error("withOrgRlsContext requires an orgId");
  }

  const scope: TransactionScope = { kind: "org", orgId, readOnly: true };
  const active = activeTransaction();
  if (active) {
    assertCompatibleScope(active, scope);
    return callback(active.client);
  }

  return basePrismaClient.$transaction(async (tx) => {
    const encryptedTx = withPiiEncryptionTransaction(tx);
    await encryptedTx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await applyTenantContext(encryptedTx, "", orgId);
    return runWithTransaction({ client: encryptedTx, scope }, () =>
      callback(encryptedTx),
    );
  });
}
