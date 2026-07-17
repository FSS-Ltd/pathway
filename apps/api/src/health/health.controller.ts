import { Controller, Get } from "@nestjs/common";
import { prisma } from "@pathway/db";
import { APP_VERSION } from "@pathway/util";

/** Env var names we care about for debugging (no values returned). */
const ENV_KEYS_TO_CHECK = [
  "NODE_ENV",
  "BILLING_PROVIDER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_SNAPSHOT",
  "STRIPE_PRICE_MAP",
  "STRIPE_PUBLISHABLE_KEY",
  "DATABASE_URL",
  "AUTH0_ISSUER",
  "AUTH0_AUDIENCE",
  "CORS_ALLOWED_ORIGINS",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "RESEND_WEBHOOK_SECRET",
  "REVALIDATE_SECRET",
  "ADMIN_URL",
  "PUBLIC_WEB_BASE_URL",
  "WEB_APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_STORAGE_PRIVATE_BUCKET",
  "SUPABASE_STORAGE_PUBLIC_BUCKET",
] as const;

@Controller("health")
export class HealthController {
  @Get()
  async ok() {
    const now = await prisma.$queryRawUnsafe<{ now: string }[]>(
      "SELECT NOW()::text as now",
    );
    return { status: "ok", dbTime: now[0]?.now ?? null, version: APP_VERSION };
  }

  /**
   * Returns which critical env vars the process sees as set (non-empty).
   * Use this in prod to verify ECS task definition env vars are reaching the container.
   * No secret values are returned.
   */
  @Get("env")
  envCheck(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const key of ENV_KEYS_TO_CHECK) {
      const value = process.env[key];
      out[key] = Boolean(value && String(value).trim().length > 0);
    }
    return out;
  }
}
