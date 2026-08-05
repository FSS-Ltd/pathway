/**
 * Bulk-exports Auth0 users via the Management API for the Auth0 -> Clerk
 * migration. No password hashes are ever requested or written - nothing
 * downstream of this export migrates passwords (see the "no passwords"
 * migration decision); only what classify-auth0-users.ts needs to match
 * identities is fetched.
 *
 * Usage:
 *   tsx scripts/auth/export-auth0-users.ts --environment=production --out=.auth0-export/users.json
 *
 * The output path must live under .auth0-export/ (gitignored) - this data
 * is personal data under UK DPA/GDPR: never write it anywhere else.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertEnvironmentGuard, readRequiredFlag } from "./environment-guard";

export type ExportedAuth0User = {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  createdAt: string | null;
};

const REQUIRED_OUT_PREFIX = ".auth0-export/";

function assertOutPath(outPath: string): string {
  const resolved = resolve(outPath);
  if (!outPath.startsWith(REQUIRED_OUT_PREFIX)) {
    console.error(
      `--out must be a path under ${REQUIRED_OUT_PREFIX} (gitignored) - refusing to write Auth0 user data to "${outPath}".`,
    );
    process.exit(1);
  }
  return resolved;
}

async function getManagementToken(domain: string, clientId: string, clientSecret: string) {
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to get Auth0 Management API token: ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function fetchAllUsers(domain: string, token: string): Promise<ExportedAuth0User[]> {
  const users: ExportedAuth0User[] = [];
  const perPage = 100;
  let page = 0;

  for (;;) {
    const url = `https://${domain}/api/v2/users?per_page=${perPage}&page=${page}&include_totals=false&fields=user_id,email,email_verified,name,created_at&sort=created_at:1`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Auth0 users list failed: ${response.status} - ${await response.text()}`);
    }
    const batch = (await response.json()) as Array<{
      user_id: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      created_at?: string;
    }>;

    if (batch.length === 0) break;

    for (const u of batch) {
      users.push({
        userId: u.user_id,
        email: u.email?.toLowerCase().trim() ?? null,
        emailVerified: Boolean(u.email_verified),
        name: u.name ?? null,
        createdAt: u.created_at ?? null,
      });
    }

    console.log(`Fetched page ${page} (${batch.length} users, ${users.length} total)`);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

async function main() {
  const environment = assertEnvironmentGuard();
  const outPath = assertOutPath(readRequiredFlag("out"));

  const issuer = process.env.AUTH0_ISSUER || "";
  const domain =
    process.env.AUTH0_DOMAIN || issuer.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const clientId = process.env.AUTH0_CLIENT_ID || "";
  const clientSecret = process.env.AUTH0_CLIENT_SECRET || "";

  if (!domain || !clientId || !clientSecret) {
    console.error("AUTH0_DOMAIN/AUTH0_ISSUER, AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET are required.");
    process.exit(1);
  }

  console.log(`Exporting Auth0 users from ${domain} (environment=${environment})...`);
  const token = await getManagementToken(domain, clientId, clientSecret);
  const users = await fetchAllUsers(domain, token);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(users, null, 2), { mode: 0o600 });

  console.log(`Wrote ${users.length} users to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
