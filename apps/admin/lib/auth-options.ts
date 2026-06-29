import type { NextAuthOptions } from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";
import https from "node:https";
import http from "node:http";

const apiBaseUrl =
  process.env.ADMIN_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://api.localhost:3001"; // Match the API HTTPS endpoint

const INTERNAL_AUTH_SECRET = process.env.INTERNAL_AUTH_SECRET;

type IdentityUpsertResponse = {
  userId?: string;
  email?: string | null;
  displayName?: string | null;
  roles?: UserRolesFromApi;
};

// For local dev: Node's fetch rejects self-signed certs (api.localhost). Use an agent
// that skips TLS verification when calling localhost HTTPS.
const isLocalhostHttps =
  apiBaseUrl.startsWith("https://") &&
  (apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1"));
const insecureAgent =
  process.env.NODE_ENV !== "production" && isLocalhostHttps
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

/**
 * Check if a string looks like an email address.
 */
function isEmail(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value.trim());
}

async function upsertIdentityToApi(payload: {
  provider: string;
  subject: string;
  email?: string | null;
  name?: string | null;
}): Promise<IdentityUpsertResponse> {
  if (!INTERNAL_AUTH_SECRET) {
    console.error("❌ [AUTH] INTERNAL_AUTH_SECRET not set! Cannot create user in DB!");
    return {};
  }

  try {
    const url = new URL(`${apiBaseUrl}/internal/auth/identity/upsert`);
    const body = JSON.stringify(payload);

    const result = await new Promise<IdentityUpsertResponse>((resolve, reject) => {
      const isHttps = url.protocol === "https:";
      const protocol = isHttps ? https : http;
      const req = protocol.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "x-pathway-internal-secret": INTERNAL_AUTH_SECRET ?? "",
          },
          ...(isHttps && insecureAgent ? { agent: insecureAgent } : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString();
            if (res.statusCode && res.statusCode >= 400) {
              console.error(
                `❌ [AUTH] Identity upsert FAILED - Status: ${res.statusCode}, Body: ${text}`,
              );
              resolve({});
              return;
            }
            try {
              const parsed = JSON.parse(text) as IdentityUpsertResponse;
              resolve(parsed);
            } catch {
              resolve({});
            }
          });
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    return result;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: string }).code)
        : "";
    if (code === "ECONNREFUSED") {
      console.error(
        "❌ [AUTH] Identity upsert failed: API unreachable at",
        apiBaseUrl,
        "- is the API server running? Check ADMIN_INTERNAL_API_URL / NEXT_PUBLIC_API_URL.",
      );
    } else {
      console.error("❌ [AUTH] Identity upsert exception:", error);
    }
    return {};
  }
}

export type UserRolesFromApi = {
  userId: string;
  superUser?: boolean;
  currentOrgIsMasterOrg?: boolean;
  orgRoles: Array<{ orgId: string; role: string }>;
  siteRoles: Array<{ tenantId: string; role: string }>;
  orgMemberships: Array<{ orgId: string; orgName: string; role: string }>;
  siteMemberships: Array<{
    tenantId: string;
    tenantName: string;
    orgId: string;
    role: string;
  }>;
  hasFamilyAccess?: boolean;
  hasServeAccess?: boolean;
};

// Admin-only NextAuth configuration.
// We treat the access token as the bearer token expected by the Nest API.
// In future, map roles/org/tenant from the ID token or profile into the session.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Auth0Provider({
      issuer: process.env.AUTH0_ISSUER,
      clientId: process.env.AUTH0_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH0_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          audience: process.env.AUTH0_AUDIENCE,
          prompt: "login", // Always show login/signup screen
          screen_hint: "signup", // Show signup tab by default (users can still switch to login)
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account, profile }) {
      try {
        // On first login, persist tokens into the JWT
        if (account?.access_token) {
          (token as any).accessToken = account.access_token;
        }
        if (account?.id_token) {
          (token as any).idToken = account.id_token;
        }

        // Upsert identity in DB whenever we have a new Auth0 session
        // Auth0 handles email verification - if user is here, they're verified
        if (account?.provider === "auth0" && token.sub) {
          const profileEmail = (profile as any)?.email ?? (token as any).email;
          const profileName =
            (profile as any)?.name ??
            (profile as any)?.given_name ??
            (token as any).name;

          // Only pass name if it exists and is NOT an email
          const safeName = profileName && !isEmail(profileName) ? profileName : undefined;

          const identity = await upsertIdentityToApi({
            provider: "auth0",
            subject: token.sub,
            email: profileEmail,
            name: safeName,
          });
          if (identity.userId) {
            (token as any).userId = identity.userId;
          }
          if (identity.email) {
            (token as any).email = identity.email;
          }
          if (identity.displayName) {
            (token as any).displayName = identity.displayName;
          }
          if (identity.roles) {
            (token as any).roles = identity.roles;
          }
        }

        return token;
      } catch (err) {
        // Never throw: log and return token so NextAuth does not redirect with error=auth0
        console.error("[🔐 AUTH] JWT callback error (returning token so login completes):", err);
        return token;
      }
    },
    async session({ session, token }) {
      try {
        if ((token as any).accessToken) {
          (session as any).accessToken = (token as any).accessToken;
        }
        if ((token as any).userId) {
          (session.user as any).id = (token as any).userId;
        }
        if ((token as any).displayName) {
          session.user!.name = (token as any).displayName;
        }
        if ((token as any).roles) {
          (session as any).roles = (token as any).roles;
        }
        return session;
      } catch (err) {
        console.error("[🔐 AUTH] Session callback error:", err);
        return session;
      }
    },
  },
  pages: {
    signIn: "/login",
  },
};
