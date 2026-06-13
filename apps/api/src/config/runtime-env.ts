const DEFAULT_ALLOWED_ORIGINS = [
  "https://nexsteps.dev",
  "https://www.nexsteps.dev",
  "https://app.nexsteps.dev",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "https://app.localhost:3000",
  "https://api.localhost:3001",
] as const;

const PRODUCTION_REQUIRED_ENV = [
  "DATABASE_URL",
  "INTERNAL_AUTH_SECRET",
  "AUTH0_ISSUER",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_AUDIENCE",
  "BILLING_PROVIDER",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "REVALIDATE_SECRET",
  "ADMIN_URL",
  "PUBLIC_WEB_BASE_URL",
  "WEB_APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_STORAGE_PRIVATE_BUCKET",
  "SUPABASE_STORAGE_PUBLIC_BUCKET",
] as const;

export function getAllowedCorsOrigins(): string[] {
  const configured = splitCsv(process.env.CORS_ALLOWED_ORIGINS);
  return configured.length > 0 ? configured : [...DEFAULT_ALLOWED_ORIGINS];
}

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = PRODUCTION_REQUIRED_ENV.filter((key) =>
    isBlank(process.env[key]),
  );

  const billingProvider = normalize(process.env.BILLING_PROVIDER);
  if (billingProvider === "STRIPE" || billingProvider === "STRIPE_TEST") {
    const stripeRequired =
      billingProvider === "STRIPE_TEST"
        ? ["STRIPE_SECRET_KEY_TEST", "STRIPE_WEBHOOK_SECRET_TEST"]
        : ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET_SNAPSHOT"];
    missing.push(...stripeRequired.filter((key) => isBlank(process.env[key])));
    if (
      isBlank(process.env.STRIPE_PRICE_MAP) &&
      isBlank(process.env.STRIPE_PRICE_MAP_TEST)
    ) {
      missing.push("STRIPE_PRICE_MAP");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${[
        ...new Set(missing),
      ].join(", ")}`,
    );
  }
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}
