// Canonical Prisma bootstrap (ESM/CJS/Jest-safe)
import { PrismaClient, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
// Keep a single PrismaClient instance across hot-reloads in dev/test
const globalForPrisma = globalThis;
const prismaContext = new AsyncLocalStorage();
const basePrismaClient = globalForPrisma.__prisma ?? new PrismaClient();
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
export const prisma = prismaProxy;
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__prisma = basePrismaClient;
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
        "Org"
      RESTART IDENTITY CASCADE
    `);
    }
    catch {
        // Fallback for environments where the current DB user cannot truncate billing tables.
        await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "UsageCounters",
        "StaffActivity",
        "OrgEntitlementSnapshot",
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
        "Org"
      RESTART IDENTITY CASCADE
    `);
    }
}
export { AssignmentStatus, Role, Weekday, SwapStatus, SubscriptionStatus, BillingProvider, PendingOrderStatus, OrgRole, SiteRole, StaffAttendanceStatus, } from "@prisma/client";
export { Prisma };
async function applyTenantContext(tx, tenantId, orgId) {
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
    const orgValue = orgId ?? "";
    await tx.$executeRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, orgValue);
    await tx.$executeRawUnsafe(`SET LOCAL row_security = on`);
}
/**
 * Run an interactive transaction using the base Prisma client.
 * Use this when prisma.$transaction fails (e.g. with the Proxy in some environments).
 */
export async function runTransaction(fn) {
    return basePrismaClient.$transaction(fn);
}
export async function withTenantRlsContext(tenantId, orgId, callback) {
    if (!tenantId) {
        throw new Error("withTenantRlsContext requires a tenantId");
    }
    return basePrismaClient.$transaction(async (tx) => {
        await applyTenantContext(tx, tenantId, orgId);
        return prismaContext.run(tx, () => callback(tx));
    });
}
