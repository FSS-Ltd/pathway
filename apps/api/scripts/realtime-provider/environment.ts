import { requireLocalTestDatabase } from "../../../../packages/db/src/__tests__/local-realtime-test-database";
import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

// Refuse remote databases before importing the application database singleton.
let databaseUrl: string;
try {
  databaseUrl = requireLocalTestDatabase(
    process.env.REALTIME_PROVIDER_DATABASE_URL ?? "",
  );
} catch {
  throw new Error(
    "Realtime provider tests require the dedicated local test database",
  );
}
process.env.DATABASE_URL = `${databaseUrl}?schema=app&connection_limit=4`;
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TEST_AUTH_TOKEN_SECRET = "isolated-realtime-provider-auth-only";
process.env.SUPABASE_URL = "https://project.supabase.co";
const { publicKey, privateKey } = await generateKeyPair("ES256", {
  extractable: true,
});
const kid = "local-provider-application-key";
process.env.SUPABASE_JWT_SIGNING_JWK = JSON.stringify({
  ...(await exportJWK(privateKey)),
  kid,
});
const secret = new TextEncoder().encode(
  "pathway-events-local-jwt-secret-at-least-32-characters",
);
export const publishableKey = await new SignJWT({ role: "anon" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("1h")
  .sign(secret);
process.env.SUPABASE_PUBLISHABLE_KEY = publishableKey;
export const providerJwks = {
  keys: [
    { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" },
    { kty: "oct", k: Buffer.from(secret).toString("base64url"), alg: "HS256" },
  ],
};
export const providerUrl = "http://127.0.0.1:15451";

export function signFixtureClaims(
  claims: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
}
