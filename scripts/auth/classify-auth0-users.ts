/**
 * Read-only dry-run classifier for the Auth0 -> Clerk migration. Takes the
 * export from export-auth0-users.ts and, for every Auth0 identity, reports
 * how it would resolve against our internal User/UserIdentity data -
 * writes no data anywhere. precreate-clerk-users.ts refuses to proceed for
 * production while any "ambiguous" bucket below is non-empty.
 *
 * Usage:
 *   tsx scripts/auth/classify-auth0-users.ts --environment=production --in=.auth0-export/users.json --out=.auth0-export/classification.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@pathway/db";
import { assertEnvironmentGuard, readRequiredFlag } from "./environment-guard";
import type { ExportedAuth0User } from "./export-auth0-users";

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

export type Classification =
  | "linked-by-identity"
  | "matched-by-verified-email"
  | "no-internal-user"
  | "multiple-internal-matches"
  | "duplicate-auth0-email"
  | "missing-email"
  | "unverified-email"
  | "already-has-clerk-identity"
  | "blocked-system-actor";

export type ClassifiedUser = {
  auth0UserId: string;
  email: string | null;
  classification: Classification;
  internalUserId: string | null;
};

// Blocked outright, checked before anything else that might link them.
const BLOCKED_REASONS: Classification[] = ["blocked-system-actor"];
// Every category precreate-clerk-users.ts must not proceed past for
// production while any of these are non-empty - genuinely ambiguous.
const AMBIGUOUS: Classification[] = ["multiple-internal-matches", "duplicate-auth0-email"];

async function classify(users: ExportedAuth0User[]): Promise<ClassifiedUser[]> {
  const emailCounts = new Map<string, number>();
  for (const u of users) {
    if (!u.email) continue;
    emailCounts.set(u.email, (emailCounts.get(u.email) ?? 0) + 1);
  }

  const results: ClassifiedUser[] = [];

  for (const u of users) {
    const identity = await prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: "auth0", providerSubject: u.userId } },
      include: { user: { include: { identities: true } } },
    });

    if (identity?.userId === SYSTEM_ACTOR_ID) {
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: "blocked-system-actor",
        internalUserId: identity.userId,
      });
      continue;
    }

    if (identity) {
      const hasClerkIdentity = identity.user.identities.some((i) => i.provider === "clerk");
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: hasClerkIdentity ? "already-has-clerk-identity" : "linked-by-identity",
        internalUserId: identity.userId,
      });
      continue;
    }

    if (!u.email) {
      results.push({
        auth0UserId: u.userId,
        email: null,
        classification: "missing-email",
        internalUserId: null,
      });
      continue;
    }

    if (!u.emailVerified) {
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: "unverified-email",
        internalUserId: null,
      });
      continue;
    }

    if ((emailCounts.get(u.email) ?? 0) > 1) {
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: "duplicate-auth0-email",
        internalUserId: null,
      });
      continue;
    }

    // User.email is @unique, so at most one internal user can match - kept
    // as a bucket rather than an assumption, defensively.
    const matches = await prisma.user.findMany({ where: { email: u.email } });
    if (matches.length > 1) {
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: "multiple-internal-matches",
        internalUserId: null,
      });
    } else if (matches.length === 1) {
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: "matched-by-verified-email",
        internalUserId: matches[0].id,
      });
    } else {
      results.push({
        auth0UserId: u.userId,
        email: u.email,
        classification: "no-internal-user",
        internalUserId: null,
      });
    }
  }

  return results;
}

async function main() {
  const environment = assertEnvironmentGuard();
  const inPath = readRequiredFlag("in");
  const outPath = readRequiredFlag("out");

  const users = JSON.parse(readFileSync(inPath, "utf-8")) as ExportedAuth0User[];
  console.log(`Classifying ${users.length} Auth0 users (environment=${environment})...`);

  const results = await classify(users);

  const summary = new Map<Classification, number>();
  for (const r of results) {
    summary.set(r.classification, (summary.get(r.classification) ?? 0) + 1);
  }

  console.log("\nClassification summary:");
  for (const [classification, count] of summary) {
    console.log(`  ${classification}: ${count}`);
  }

  const blocked = results.filter((r) => BLOCKED_REASONS.includes(r.classification));
  const ambiguous = results.filter((r) => AMBIGUOUS.includes(r.classification));
  if (blocked.length > 0) {
    console.log(`\n${blocked.length} user(s) blocked (system actor) - excluded from every import.`);
  }
  if (ambiguous.length > 0) {
    console.log(
      `\n${ambiguous.length} user(s) ambiguous - precreate-clerk-users.ts will refuse to run for production while these remain.`,
    );
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2), { mode: 0o600 });
  console.log(`\nWrote classification report to ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
