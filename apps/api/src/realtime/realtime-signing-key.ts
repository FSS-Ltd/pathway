import { ServiceUnavailableException } from "@nestjs/common";
import { importJWK, type JWK } from "jose";

const unavailable = () =>
  new ServiceUnavailableException("Live messaging is unavailable");

export async function loadRealtimeSigningKey(): Promise<{
  key: Awaited<ReturnType<typeof importJWK>>;
  kid: string;
}> {
  const raw = process.env.SUPABASE_JWT_SIGNING_JWK;
  if (!raw) throw unavailable();

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw unavailable();
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw unavailable();
  }

  const candidate = value as Record<string, unknown>;
  const { kid, x, y, d } = candidate;
  if (
    candidate.kty !== "EC" ||
    candidate.crv !== "P-256" ||
    typeof kid !== "string" ||
    !kid.trim() ||
    typeof x !== "string" ||
    !x ||
    typeof y !== "string" ||
    !y ||
    typeof d !== "string" ||
    !d
  ) {
    throw unavailable();
  }

  const jwk: JWK = { kty: "EC", crv: "P-256", kid, x, y, d };
  try {
    return { key: await importJWK(jwk, "ES256"), kid };
  } catch {
    throw unavailable();
  }
}
