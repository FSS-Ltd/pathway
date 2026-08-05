/**
 * Hard invariant checks for the Auth0 -> Clerk migration. Run after every
 * batch of precreate-clerk-users.ts; any non-empty result below blocks
 * progress to the next batch or to cutover. Exits non-zero if any
 * invariant is violated.
 *
 * Usage:
 *   tsx scripts/auth/reconcile-identities.ts --environment=production
 */
import { prisma } from "@pathway/db";
import { assertEnvironmentGuard } from "./environment-guard";

async function main() {
  const environment = assertEnvironmentGuard();
  console.log(`Reconciling identities (environment=${environment})...\n`);

  let violations = 0;

  const duplicateClerkSubjects = await prisma.$queryRaw<
    { providerSubject: string; count: bigint }[]
  >`
    SELECT "providerSubject", COUNT(*) as count FROM "UserIdentity"
    WHERE "provider" = 'clerk' GROUP BY "providerSubject" HAVING COUNT(*) > 1
  `;
  if (duplicateClerkSubjects.length > 0) {
    violations += duplicateClerkSubjects.length;
    console.error(
      `❌ ${duplicateClerkSubjects.length} Clerk providerSubject(s) linked to more than one UserIdentity row:`,
      duplicateClerkSubjects,
    );
  } else {
    console.log("✅ No duplicate Clerk providerSubjects.");
  }

  const duplicateClerkUsers = await prisma.$queryRaw<{ userId: string; count: bigint }[]>`
    SELECT "userId", COUNT(*) as count FROM "UserIdentity"
    WHERE "provider" = 'clerk' GROUP BY "userId" HAVING COUNT(*) > 1
  `;
  if (duplicateClerkUsers.length > 0) {
    violations += duplicateClerkUsers.length;
    console.error(
      `❌ ${duplicateClerkUsers.length} internal user(s) linked to more than one Clerk identity:`,
      duplicateClerkUsers,
    );
  } else {
    console.log("✅ No user linked to more than one Clerk identity.");
  }

  const activeUsersWithNoIdentity = await prisma.$queryRaw<{ id: string; email: string | null }[]>`
    SELECT u.id, u.email FROM "User" u
    LEFT JOIN "UserIdentity" i ON i."userId" = u.id
    WHERE i.id IS NULL AND u."isActive" = true
  `;
  if (activeUsersWithNoIdentity.length > 0) {
    console.warn(
      `⚠️  ${activeUsersWithNoIdentity.length} active user(s) have no provider identity at all (expected for users who never signed in - not necessarily a violation, review before cutover).`,
    );
  } else {
    console.log("✅ Every active user has at least one provider identity.");
  }

  if (violations > 0) {
    console.error(`\n${violations} invariant violation(s) found. Blocking progress.`);
    process.exit(1);
  }

  console.log("\nAll hard invariants pass.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
