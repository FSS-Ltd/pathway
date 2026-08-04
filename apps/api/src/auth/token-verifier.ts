import { UnauthorizedException } from "@nestjs/common";
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";

export type VerifiedProvider = "auth0" | "clerk";

export type VerifiedPrincipal = {
  provider: VerifiedProvider;
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  /** Set on tokens minted by our own createUser calls; internal User.id. */
  externalId?: string;
};

type IssuerConfig = {
  provider: VerifiedProvider;
  issuer: string;
  audience?: string;
  getKey: JWTVerifyGetKey;
};

const TEST_ISSUER = "pathway-test";

/**
 * Captured once at process/module start, not re-read per request. A real
 * deployed process never mutates NODE_ENV at runtime - only test suites do,
 * usually to simulate a different runtime condition for one unrelated
 * assertion (e.g. "this endpoint 403s in production"). Re-reading it per
 * request would let that mutation flip auth outcomes mid-suite even though
 * TEST_AUTH_TOKEN_SECRET (the actual secret) never changed.
 */
const IS_TEST_RUNTIME = process.env.NODE_ENV === "test";

let configs: IssuerConfig[] | null = null;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Clerk publishable keys are base64("<frontend-api-host>$"). Deriving the
 * issuer from the (public, non-secret) publishable key means CLERK_ISSUER
 * doesn't need to be configured separately - one fewer var to keep in sync
 * with whichever Clerk instance the publishable key points at.
 */
function deriveClerkIssuerFromPublishableKey(key: string): string | null {
  const encoded = key.replace(/^pk_(test|live)_/, "");
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const host = decoded.replace(/\$+$/, "");
    if (!host) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

function buildConfigs(): IssuerConfig[] {
  const built: IssuerConfig[] = [];

  const auth0Issuer = process.env.AUTH0_ISSUER;
  if (auth0Issuer) {
    const issuer = auth0Issuer.endsWith("/")
      ? auth0Issuer
      : `${auth0Issuer}/`;
    built.push({
      provider: "auth0",
      issuer,
      audience: process.env.AUTH0_AUDIENCE,
      getKey: createRemoteJWKSet(
        new URL(`${stripTrailingSlash(issuer)}/.well-known/jwks.json`),
      ),
    });
  }

  const clerkIssuer =
    process.env.CLERK_ISSUER ??
    (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      ? deriveClerkIssuerFromPublishableKey(
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        )
      : null);
  if (clerkIssuer) {
    const issuer = stripTrailingSlash(clerkIssuer);
    built.push({
      provider: "clerk",
      issuer,
      audience: process.env.CLERK_AUDIENCE,
      getKey: createRemoteJWKSet(
        new URL(`${issuer}/.well-known/jwks.json`),
      ),
    });
  }

  return built;
}

function getConfigs(): IssuerConfig[] {
  if (!configs) configs = buildConfigs();
  return configs;
}

/** Test-only escape hatch. Never reachable outside NODE_ENV=test. */
async function verifyTestToken(token: string): Promise<VerifiedPrincipal> {
  const secret = process.env.TEST_AUTH_TOKEN_SECRET;
  if (!secret) {
    throw new UnauthorizedException("Test token secret not configured");
  }
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { issuer: TEST_ISSUER },
    );
    const provider = payload.provider === "clerk" ? "clerk" : "auth0";
    return principalFromPayload(provider, payload);
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw new UnauthorizedException(
      `Test token verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Test-only helper for signing e2e fixtures. Mirrors verifyTestToken. */
export async function signTestToken(payload: {
  sub: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  externalId?: string;
  provider?: VerifiedProvider;
}): Promise<string> {
  const secret = process.env.TEST_AUTH_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "TEST_AUTH_TOKEN_SECRET must be set to sign test tokens (see .env.test)",
    );
  }
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    email_verified: payload.emailVerified,
    external_id: payload.externalId,
    provider: payload.provider ?? "auth0",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TEST_ISSUER)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

function principalFromPayload(
  provider: VerifiedProvider,
  payload: Record<string, unknown>,
): VerifiedPrincipal {
  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  if (!sub) {
    throw new UnauthorizedException("Missing subject claim");
  }
  return {
    provider,
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified:
      typeof payload.email_verified === "boolean"
        ? payload.email_verified
        : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    externalId:
      typeof payload.external_id === "string" ? payload.external_id : undefined,
  };
}

/**
 * Verifies a bearer token's signature, issuer, audience and expiry, then
 * returns the principal it asserts. Replaces the previous decode-only path
 * (apps/api/src/auth/auth-token.util.ts) that trusted any well-formed JWT.
 */
export async function verifyBearerToken(
  authorizationHeader: string | undefined,
): Promise<VerifiedPrincipal> {
  if (!authorizationHeader) {
    throw new UnauthorizedException("Missing Authorization header");
  }
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedException("Unsupported Authorization header");
  }

  let unverifiedIssuer: string | undefined;
  try {
    unverifiedIssuer = decodeJwt(token).iss;
  } catch {
    throw new UnauthorizedException("Malformed bearer token");
  }

  if (IS_TEST_RUNTIME && unverifiedIssuer === TEST_ISSUER) {
    return verifyTestToken(token);
  }

  const config = getConfigs().find((c) => c.issuer === unverifiedIssuer);
  if (!config) {
    throw new UnauthorizedException("Unrecognised token issuer");
  }

  try {
    const { payload } = await jwtVerify(token, config.getKey, {
      issuer: config.issuer,
      audience: config.audience,
    });
    return principalFromPayload(config.provider, payload);
  } catch (error) {
    throw new UnauthorizedException(
      `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
