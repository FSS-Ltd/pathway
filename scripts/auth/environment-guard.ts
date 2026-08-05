/**
 * Shared guardrails for the Auth0 -> Clerk migration scripts in this
 * directory. Every script here can touch production identity data, so
 * every script must call assertEnvironmentGuard() before doing anything
 * else: it refuses to run without an explicit --environment, and refuses
 * any mismatch between that environment and the Clerk key actually
 * configured (a live key outside production, or a non-live key inside it).
 */

export type Environment = "development" | "staging" | "production";

const ENVIRONMENTS: Environment[] = ["development", "staging", "production"];

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function readRequiredFlag(name: string): string {
  const value = readFlag(name);
  if (!value) {
    console.error(`Missing required --${name}=<value> flag.`);
    process.exit(1);
  }
  return value;
}

export { readFlag };

export function assertEnvironmentGuard(): Environment {
  const raw = readFlag("environment");
  if (!raw || !ENVIRONMENTS.includes(raw as Environment)) {
    console.error(
      `Refusing to run without an explicit --environment=<${ENVIRONMENTS.join("|")}> flag.`,
    );
    process.exit(1);
  }
  const environment = raw as Environment;

  const clerkSecretKey = process.env.CLERK_SECRET_KEY ?? "";
  const isLiveKey = clerkSecretKey.startsWith("sk_live_");

  if (isLiveKey && environment !== "production") {
    console.error(
      `CLERK_SECRET_KEY is a live (sk_live_) key but --environment=${environment}. ` +
        "Refusing to run a live key against a non-production environment.",
    );
    process.exit(1);
  }

  if (!isLiveKey && environment === "production") {
    console.error(
      "--environment=production requires a live (sk_live_) CLERK_SECRET_KEY. " +
        "Refusing to run a non-live key against production.",
    );
    process.exit(1);
  }

  return environment;
}
