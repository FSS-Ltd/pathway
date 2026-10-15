import { ServiceUnavailableException } from "@nestjs/common";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { loadRealtimeSigningKey } from "./realtime-signing-key";

const originalJwk = process.env.SUPABASE_JWT_SIGNING_JWK;

afterEach(() => {
  if (originalJwk === undefined) delete process.env.SUPABASE_JWT_SIGNING_JWK;
  else process.env.SUPABASE_JWT_SIGNING_JWK = originalJwk;
});

it("signs ES256 tokens with the imported key identifier", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const kid = randomUUID();
  process.env.SUPABASE_JWT_SIGNING_JWK = JSON.stringify({
    ...(await exportJWK(privateKey)),
    kid,
  });

  const signingKey = await loadRealtimeSigningKey();
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: signingKey.kid })
    .sign(signingKey.key);
  const verified = await jwtVerify(token, publicKey, {
    algorithms: ["ES256"],
  });
  expect(verified.protectedHeader.kid).toBe(kid);
  expect(verified.payload.role).toBe("authenticated");
});

it.each([
  undefined,
  "not-json",
  JSON.stringify({ kty: "EC", crv: "P-256", kid: "public-only" }),
  JSON.stringify({ kty: "oct", k: "shared-secret", kid: "legacy" }),
])("rejects absent or invalid private signing keys", async (value) => {
  if (value === undefined) delete process.env.SUPABASE_JWT_SIGNING_JWK;
  else process.env.SUPABASE_JWT_SIGNING_JWK = value;
  await expect(loadRealtimeSigningKey()).rejects.toBeInstanceOf(
    ServiceUnavailableException,
  );
});
