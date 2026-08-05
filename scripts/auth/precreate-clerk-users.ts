/**
 * Idempotent pre-creation of Clerk users for the Auth0 -> Clerk migration.
 * Consumes classify-auth0-users.ts's report and, for every user that
 * resolved cleanly to exactly one internal User, creates (or reuses) a
 * Clerk user keyed by externalId = internal User.id, with NO password -
 * see the "no passwords" migration decision in the plan: password users
 * reset once on first Clerk sign-in, social users re-consent.
 *
 * Skips anything that already has a Clerk identity or an ambiguous match.
 * Refuses to run at all for production while the classification report
 * still contains ambiguous entries (multiple-internal-matches,
 * duplicate-auth0-email) - non-production runs skip those with a warning
 * instead, since rehearsal data is expected to be messier.
 *
 * Usage:
 *   tsx scripts/auth/precreate-clerk-users.ts --environment=production \
 *     --in=.auth0-export/classification.json \
 *     --out=.auth0-export/precreate-report.json \
 *     --confirmation=MIGRATE_NEXSTEPS_PRODUCTION
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { prisma } from "@pathway/db";
import { assertEnvironmentGuard, readFlag, readRequiredFlag } from "./environment-guard";
import type { ClassifiedUser } from "./classify-auth0-users";

const PRODUCTION_CONFIRMATION = "MIGRATE_NEXSTEPS_PRODUCTION";
const LINKABLE = new Set<ClassifiedUser["classification"]>([
  "linked-by-identity",
  "matched-by-verified-email",
]);
const AMBIGUOUS = new Set<ClassifiedUser["classification"]>([
  "multiple-internal-matches",
  "duplicate-auth0-email",
]);

type ClerkUser = { id: string };

async function findClerkUserByEmail(secretKey: string, email: string): Promise<string | null> {
  const response = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!response.ok) return null;
  const users = (await response.json()) as ClerkUser[];
  return users[0]?.id ?? null;
}

async function createClerkUser(
  secretKey: string,
  params: { email: string; name: string | null; externalId: string },
): Promise<string | null> {
  const [firstName, ...rest] = (params.name ?? "").trim().split(/\s+/);
  const response = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secretKey}` },
    body: JSON.stringify({
      email_address: [params.email],
      external_id: params.externalId,
      skip_password_requirement: true,
      first_name: firstName || undefined,
      last_name: rest.join(" ") || undefined,
      private_metadata: { migrationVersion: "auth0-clerk-v1" },
    }),
  });

  if (response.ok) {
    const user = (await response.json()) as ClerkUser;
    return user.id;
  }

  if (response.status === 422 || response.status === 409) {
    // Already exists - most likely a retry after a partial earlier run.
    return findClerkUserByEmail(secretKey, params.email);
  }

  console.error(`Failed to create Clerk user for ${params.externalId}: ${response.status} - ${await response.text()}`);
  return null;
}

async function main() {
  const environment = assertEnvironmentGuard();
  const inPath = readRequiredFlag("in");
  const outPath = readRequiredFlag("out");
  const confirmation = readFlag("confirmation");

  if (environment === "production" && confirmation !== PRODUCTION_CONFIRMATION) {
    console.error(
      `--environment=production requires --confirmation=${PRODUCTION_CONFIRMATION}.`,
    );
    process.exit(1);
  }

  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is required.");
    process.exit(1);
  }

  const classified = JSON.parse(readFileSync(inPath, "utf-8")) as ClassifiedUser[];

  const ambiguous = classified.filter((c) => AMBIGUOUS.has(c.classification));
  if (environment === "production" && ambiguous.length > 0) {
    console.error(
      `Refusing to run for production: ${ambiguous.length} ambiguous entr${ambiguous.length === 1 ? "y" : "ies"} remain in the classification report. Resolve them first.`,
    );
    process.exit(1);
  }
  if (ambiguous.length > 0) {
    console.warn(`Skipping ${ambiguous.length} ambiguous entries (non-production run).`);
  }

  const linkable = classified.filter(
    (c) => LINKABLE.has(c.classification) && c.internalUserId && c.email,
  );
  console.log(`Pre-creating Clerk users for ${linkable.length} matched account(s)...`);

  const report = {
    created: [] as string[],
    linked: [] as string[],
    skipped: [] as { auth0UserId: string; reason: string }[],
    failed: [] as { auth0UserId: string; error: string }[],
  };

  for (const c of linkable) {
    const internalUserId = c.internalUserId as string;
    const email = c.email as string;

    const existingClerkIdentity = await prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: "clerk", providerSubject: internalUserId } },
    });
    if (existingClerkIdentity) {
      report.skipped.push({ auth0UserId: c.auth0UserId, reason: "already linked to Clerk" });
      continue;
    }

    const user = await prisma.user.findUnique({ where: { id: internalUserId } });
    if (!user) {
      report.failed.push({ auth0UserId: c.auth0UserId, error: "internal user no longer exists" });
      continue;
    }

    try {
      const clerkUserId = await createClerkUser(secretKey, {
        email,
        name: user.displayName ?? user.name,
        externalId: internalUserId,
      });
      if (!clerkUserId) {
        report.failed.push({ auth0UserId: c.auth0UserId, error: "Clerk user creation failed" });
        continue;
      }

      await prisma.userIdentity.upsert({
        where: { provider_providerSubject: { provider: "clerk", providerSubject: clerkUserId } },
        create: { userId: internalUserId, provider: "clerk", providerSubject: clerkUserId, email },
        update: { userId: internalUserId, email },
      });

      report.created.push(clerkUserId);
      report.linked.push(internalUserId);
    } catch (error) {
      report.failed.push({
        auth0UserId: c.auth0UserId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  writeFileSync(outPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    `\nDone. created=${report.created.length} skipped=${report.skipped.length} failed=${report.failed.length}`,
  );
  console.log(`Report written to ${outPath}`);

  if (report.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
