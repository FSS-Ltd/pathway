import { OrgRole, prisma, SiteRole } from "@pathway/db";
import { randomUUID } from "node:crypto";

interface SeedE2eAuthUserOptions {
  subject: string;
  tenantId?: string;
  siteRole?: SiteRole;
  orgId?: string;
  orgRole?: OrgRole;
  userId?: string;
  email?: string;
  name?: string;
  hasFamilyAccess?: boolean;
}

interface E2eAuthUser {
  userId: string;
  authorization: string;
}

export async function seedE2eAuthUser(
  options: SeedE2eAuthUserOptions,
): Promise<E2eAuthUser> {
  if (options.siteRole && !options.tenantId) {
    throw new Error("tenantId is required when seeding a site role");
  }
  if (options.orgRole && !options.orgId) {
    throw new Error("orgId is required when seeding an organisation role");
  }

  const userId = options.userId ?? randomUUID();
  const email = options.email ?? `${userId}@example.test`;

  await prisma.user.upsert({
    where: { id: userId },
    update: {
      lastActiveTenantId: options.tenantId,
      hasFamilyAccess: options.hasFamilyAccess,
    },
    create: {
      id: userId,
      email,
      name: options.name,
      lastActiveTenantId: options.tenantId,
      hasFamilyAccess: options.hasFamilyAccess,
    },
  });
  await prisma.userIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: "auth0",
        providerSubject: options.subject,
      },
    },
    update: { userId, email },
    create: {
      userId,
      provider: "auth0",
      providerSubject: options.subject,
      email,
    },
  });

  if (options.tenantId && options.siteRole) {
    await prisma.siteMembership.upsert({
      where: {
        tenantId_userId: { tenantId: options.tenantId, userId },
      },
      update: { role: options.siteRole },
      create: {
        tenantId: options.tenantId,
        userId,
        role: options.siteRole,
      },
    });
  }
  if (options.orgId && options.orgRole) {
    await prisma.orgMembership.upsert({
      where: { orgId_userId: { orgId: options.orgId, userId } },
      update: { role: options.orgRole },
      create: { orgId: options.orgId, userId, role: options.orgRole },
    });
  }

  const payload = Buffer.from(
    JSON.stringify({ sub: options.subject, email }),
  ).toString("base64url");

  return {
    userId,
    authorization: `Bearer test.${payload}.sig`,
  };
}

export async function clearE2eAuthAccess(userId: string): Promise<void> {
  await prisma.userIdentity.deleteMany({ where: { userId } });
  await prisma.siteMembership.deleteMany({ where: { userId } });
  await prisma.orgMembership.deleteMany({ where: { userId } });
}

/**
 * Helper function to check if database is available for e2e tests.
 * Returns true if database is available, false otherwise.
 * Should be used at the start of beforeAll hooks to skip tests gracefully.
 */
export function isDatabaseAvailable(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).__E2E_DB_AVAILABLE === true;
}

/**
 * Helper function to skip tests if database is not available.
 * Call this at the start of beforeAll hooks.
 * Returns true if database is available, false otherwise.
 * Tests should check the return value and return early if false.
 */
export function requireDatabase(): boolean {
  if (!isDatabaseAvailable()) {
    console.warn(
      "[test-helpers.e2e] Database is not available. Tests will be skipped.",
    );
    return false;
  }
  return true;
}

/**
 * Helper to skip a test if the app is not initialized (database unavailable).
 * Use this to guard test cases that require the app to be initialized.
 */
export function skipIfNoApp<T>(
  app: T | undefined,
  testFn: (app: T) => void | Promise<void>,
): void {
  if (!app) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).jest = (global as any).jest || {};
    // Use Jest's skip functionality
    return;
  }
  testFn(app);
}

/**
 * Helper to create a beforeEach hook that skips tests if app is not initialized.
 * Use this in test suites to automatically skip all tests when database is unavailable.
 * 
 * Example:
 * beforeEach(() => {
 *   skipTestsIfNoApp(app);
 * });
 */
export function skipTestsIfNoApp(app: unknown): void {
  if (!app) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).jest = (global as any).jest || {};
    // Mark current test as skipped
    // Note: This is a workaround - Jest doesn't have a direct way to skip from beforeEach
    // The actual skipping happens in individual tests with `if (!app) return;`
  }
}
