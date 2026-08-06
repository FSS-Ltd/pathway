#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import {
  getArgValue,
  isPresent,
  loadEnvFile,
  resolveEnvFile,
} from "./lib/env-file.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const strict = args.has("--strict");
const selectedTarget = getArgValue("--target");
const envFile = resolveEnvFile();
const sourceEnv = loadEnvFile(envFile);
const automationEnv = { ...sourceEnv, ...process.env };
const env = withDerivedValues(automationEnv);

const PROJECTS = {
  web: {
    idEnv: "VERCEL_WEB_PROJECT_ID",
    optionalKeys: ["NEXT_PUBLIC_ANALYTICS_ENDPOINT"],
    keys: [
      "NODE_ENV",
      "NEXT_PUBLIC_API_URL",
      "API_INTERNAL_URL",
      "NEXT_PUBLIC_SITE_URL",
      "REVALIDATE_SECRET",
      "NEXT_PUBLIC_ANALYTICS_ENDPOINT",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ],
  },
  admin: {
    idEnv: "VERCEL_ADMIN_PROJECT_ID",
    // Auth0/NextAuth keys stay synced (not yet removed - see PR8 of the
    // Auth0->Clerk migration) even though apps/admin itself runs on Clerk
    // unconditionally as of the apps/admin migration PR.
    optionalKeys: [],
    keys: [
      "NODE_ENV",
      "NEXT_PUBLIC_API_URL",
      "ADMIN_INTERNAL_API_URL",
      "NEXTAUTH_URL",
      "NEXTAUTH_SECRET",
      "AUTH0_ISSUER",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
      "AUTH0_AUDIENCE",
      "INTERNAL_AUTH_SECRET",
      "NEXT_PUBLIC_USE_MOCK_API",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ],
  },
  api: {
    idEnv: "VERCEL_API_PROJECT_ID",
    optionalKeys: [
      "STRIPE_SECRET_KEY_TEST",
      "STRIPE_WEBHOOK_SECRET_TEST",
      "STRIPE_PRICE_MAP_TEST",
      "RESEND_WEBHOOK_SECRET",
      // Not read unless the token issuer can't be derived from
      // NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY - see token-verifier.ts.
      "CLERK_ISSUER",
      "CLERK_AUDIENCE",
    ],
    keys: [
      "NODE_ENV",
      "API_HOST",
      "API_BIND_HOST",
      "CORS_ALLOWED_ORIGINS",
      "DATABASE_URL",
      "INTERNAL_AUTH_SECRET",
      "AUTH0_ISSUER",
      "AUTH0_DOMAIN",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
      "AUTH0_AUDIENCE",
      // AUTH_PROVIDER_MODE deliberately stays out of runtime-env.ts's
      // PRODUCTION_REQUIRED_ENV until it's confirmed set here - adding it
      // there first would make an unset var start throwing in production.
      "AUTH_PROVIDER_MODE",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "CLERK_WEBHOOK_SIGNING_SECRET",
      "BILLING_PROVIDER",
      "STRIPE_SECRET_KEY",
      "STRIPE_SECRET_KEY_TEST",
      "STRIPE_WEBHOOK_SECRET_SNAPSHOT",
      "STRIPE_WEBHOOK_SECRET_THIN",
      "STRIPE_WEBHOOK_SECRET_TEST",
      "STRIPE_PRICE_MAP",
      "STRIPE_PRICE_MAP_TEST",
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_SUCCESS_URL",
      "STRIPE_CANCEL_URL",
      "RESEND_API_KEY",
      "RESEND_FROM",
      "RESEND_WEBHOOK_SECRET",
      "REVALIDATE_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_STORAGE_PRIVATE_BUCKET",
      "SUPABASE_STORAGE_PUBLIC_BUCKET",
      "ADMIN_URL",
      "ADMIN_BASE_URL",
      "APP_PUBLIC_URL",
      "PUBLIC_WEB_BASE_URL",
      "NEXSTEPS_WEB_BASE_URL",
      "PUBLIC_BLOG_BASE_URL",
      "WEB_APP_URL",
      "SITE_URL",
    ],
  },
};

const targets = selectedTarget
  ? Object.entries(PROJECTS).filter(([name]) => name === selectedTarget)
  : Object.entries(PROJECTS);

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[vercel-env] ${message}`);
  process.exit(1);
});

async function main() {
  if (selectedTarget && targets.length === 0) {
    throw new Error(
      `Unknown target "${selectedTarget}". Use web, admin, or api.`,
    );
  }

  console.log(
    `[vercel-env] source=${path.relative(process.cwd(), envFile)} mode=${modeName()}`,
  );

  const plans = targets.map(([name, project]) =>
    buildProjectPlan(name, project),
  );
  for (const plan of plans) {
    reportProjectPlan(plan);
  }

  if (apply || strict) {
    const errors = collectApplyErrors(plans);
    if (errors.length > 0) {
      const prefix = apply
        ? "Cannot apply Vercel env sync"
        : "Vercel env sync is not launch-ready";
      throw new Error(`${prefix}:\n- ${errors.join("\n- ")}`);
    }
  }

  if (apply) {
    for (const plan of plans) {
      await syncProject(plan);
    }
  }
}

function modeName() {
  if (apply) return "apply";
  return strict ? "strict" : "dry-run";
}

function buildProjectPlan(name, project) {
  const entries = project.keys
    .map((key) => [key, env[key]])
    .filter(([, value]) => isPresent(value))
    .map(([key, value]) => ({
      key,
      value,
      type: "encrypted",
      target: ["production"],
      comment: `Synced from ${path.basename(envFile)}`,
    }));

  const optionalKeys = new Set(project.optionalKeys ?? []);
  const missingRequired = project.keys.filter(
    (key) => !optionalKeys.has(key) && !isPresent(env[key]),
  );
  const missingOptional = project.keys.filter(
    (key) => optionalKeys.has(key) && !isPresent(env[key]),
  );

  return {
    name,
    project,
    projectId: automationEnv[project.idEnv],
    entries,
    missingRequired,
    missingOptional,
    warnings: getProjectWarnings(name),
  };
}

function reportProjectPlan(plan) {
  console.log(
    `[vercel-env] ${plan.name}: ${plan.entries.length} vars ready; ${
      plan.missingRequired.length
    } required missing${
      plan.missingRequired.length ? ` (${plan.missingRequired.join(", ")})` : ""
    }; ${plan.missingOptional.length} optional missing${
      plan.missingOptional.length ? ` (${plan.missingOptional.join(", ")})` : ""
    }`,
  );
  for (const warning of plan.warnings) {
    console.log(`[vercel-env] ${plan.name}: warning: ${warning}`);
  }
}

function collectApplyErrors(plans) {
  const errors = [];
  if (!isPresent(automationEnv.VERCEL_TOKEN)) {
    const requiredFor = apply ? "when using --apply" : "for launch preflight";
    errors.push(`VERCEL_TOKEN is required ${requiredFor}.`);
  }

  for (const plan of plans) {
    if (!isPresent(plan.projectId)) {
      errors.push(`${plan.project.idEnv} is required to sync ${plan.name}.`);
    }
    if (plan.name === "api" && isDirectSupabaseDatabaseUrl(env.DATABASE_URL)) {
      errors.push(
        "api DATABASE_URL must use the Supavisor transaction pooler for Vercel runtime; move the direct/session URL to DIRECT_URL.",
      );
    }
    if (plan.missingRequired.length > 0) {
      errors.push(
        `${plan.name} is missing required vars: ${plan.missingRequired.join(
          ", ",
        )}`,
      );
    }
  }

  return errors;
}

async function syncProject(plan) {
  if (plan.entries.length === 0) return;

  const url = new URL(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(
      plan.projectId,
    )}/env`,
  );
  url.searchParams.set("upsert", "true");
  const teamId = resolveTeamId();
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${automationEnv.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(plan.entries),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Vercel env sync failed for ${plan.name}: ${response.status} ${text.slice(
        0,
        500,
      )}`,
    );
  }

  const body = await response.json().catch(() => ({}));
  const failed = Array.isArray(body.failed) ? body.failed.length : 0;
  if (failed > 0) {
    throw new Error(
      `Vercel env sync reported ${failed} failed vars for ${plan.name}.`,
    );
  }
  console.log(
    `[vercel-env] ${plan.name}: synced ${plan.entries.length} production vars`,
  );
}

function withDerivedValues(values) {
  const next = { ...values };
  next.NODE_ENV ??= "production";

  applyAlias(next, "SSTRIPE_PRICE_MAP", "STRIPE_PRICE_MAP");

  const apiUrl = next.NEXT_PUBLIC_API_URL ?? "https://api.nexsteps.dev";
  const adminUrl = next.NEXTAUTH_URL ?? "https://app.nexsteps.dev";
  const webUrl =
    next.NEXT_PUBLIC_SITE_URL ??
    next.PUBLIC_WEB_BASE_URL ??
    next.WEB_APP_URL ??
    "https://nexsteps.dev";

  next.NEXT_PUBLIC_API_URL ??= apiUrl;
  next.API_INTERNAL_URL ??= apiUrl;
  next.ADMIN_INTERNAL_API_URL ??= apiUrl;
  next.NEXT_PUBLIC_SITE_URL ??= webUrl;
  next.NEXTAUTH_URL ??= adminUrl;
  next.NEXT_PUBLIC_USE_MOCK_API ??= "false";

  next.API_HOST ??= new URL(apiUrl).host;
  next.API_BIND_HOST ??= "0.0.0.0";
  next.CORS_ALLOWED_ORIGINS ??= [
    webUrl,
    "https://www.nexsteps.dev",
    adminUrl,
  ].join(",");

  next.ADMIN_URL ??= adminUrl;
  next.ADMIN_BASE_URL ??= adminUrl;
  next.APP_PUBLIC_URL ??= adminUrl;
  next.PUBLIC_WEB_BASE_URL ??= webUrl;
  next.NEXSTEPS_WEB_BASE_URL ??= webUrl;
  next.PUBLIC_BLOG_BASE_URL ??= webUrl;
  next.WEB_APP_URL ??= webUrl;
  next.SITE_URL ??= webUrl;
  next.STRIPE_SUCCESS_URL ??= `${adminUrl}/admin/billing/success`;
  next.STRIPE_CANCEL_URL ??= `${adminUrl}/admin/billing`;
  next.AUTH0_DOMAIN ??= hostFromUrl(next.AUTH0_ISSUER);
  next.SUPABASE_URL ??= supabaseUrlFromDatabaseUrl(next.DATABASE_URL);
  next.SUPABASE_STORAGE_PRIVATE_BUCKET ??= "pathway-private";
  next.SUPABASE_STORAGE_PUBLIC_BUCKET ??= "pathway-public";

  return next;
}

function applyAlias(values, from, to) {
  if (isPresent(values[from]) && !isPresent(values[to])) {
    values[to] = values[from];
  }
}

function resolveTeamId() {
  if (automationEnv.VERCEL_TEAM_ID) return automationEnv.VERCEL_TEAM_ID;
  const orgId = automationEnv.VERCEL_ORG_ID;
  return orgId?.startsWith("team_") ? orgId : undefined;
}

function getProjectWarnings(name) {
  if (name !== "api") return [];
  if (!isDirectSupabaseDatabaseUrl(env.DATABASE_URL)) return [];
  return [
    "DATABASE_URL points at the direct Supabase database host. For Vercel serverless Prisma deployments, use the Supavisor transaction pooler on port 6543 with pgbouncer=true, and keep direct/session connectivity in DIRECT_URL for migrations.",
  ];
}

function hostFromUrl(value) {
  if (!isPresent(value)) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function supabaseUrlFromDatabaseUrl(value) {
  if (!isPresent(value)) return undefined;
  const match = value.match(/db\.([a-z0-9]+)\.supabase\.co/i);
  return match?.[1] ? `https://${match[1]}.supabase.co` : undefined;
}

function isDirectSupabaseDatabaseUrl(value) {
  if (!isPresent(value)) return false;
  try {
    return (
      new URL(value).host.startsWith("db.") && value.includes(".supabase.co")
    );
  } catch {
    return false;
  }
}
