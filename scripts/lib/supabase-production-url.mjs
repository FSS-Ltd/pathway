import { parseEnvFile } from "./env-file.mjs";

const POOLER_HOST_PATTERN = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/i;

export function inspectSupabaseSettings(contents) {
  const parsed = parseEnvFile(contents);
  const projectRef = projectRefFromDatabaseUrl(
    parsed.DATABASE_URL,
    "DATABASE_URL",
  );
  if (parsed.DIRECT_URL) {
    const directRef = projectRefFromDatabaseUrl(
      parsed.DIRECT_URL,
      "DIRECT_URL",
    );
    if (directRef !== projectRef) {
      throw new Error(
        "DIRECT_URL and DATABASE_URL point at different Supabase projects.",
      );
    }
  }

  const projectUrl = `https://${projectRef}.supabase.co`;
  if (
    parsed.SUPABASE_URL &&
    parsed.SUPABASE_URL.replace(/\/$/, "") !== projectUrl
  ) {
    throw new Error(
      "SUPABASE_URL and DATABASE_URL point at different Supabase projects.",
    );
  }

  const poolerHosts = [parsed.DATABASE_URL, parsed.DIRECT_URL]
    .filter(Boolean)
    .map((value) => new URL(value).hostname)
    .filter((host) => POOLER_HOST_PATTERN.test(host));
  const poolerHost = parsed.SUPABASE_POOLER_HOST ?? poolerHosts[0];
  if (poolerHost && !POOLER_HOST_PATTERN.test(poolerHost)) {
    throw new Error(
      "SUPABASE_POOLER_HOST must be a Supabase shared pooler host.",
    );
  }
  if (poolerHosts.some((host) => host !== poolerHost)) {
    throw new Error("Configured Supabase pooler hosts do not match.");
  }
  if (
    !poolerHost &&
    [parsed.DATABASE_URL, parsed.DIRECT_URL].some(isDirectSupabaseDatabaseUrl)
  ) {
    throw new Error(
      "A configured pooler host (SUPABASE_POOLER_HOST or matching session pooler URL) is required to convert a direct database URL.",
    );
  }

  return { projectUrl, poolerHost };
}

export function buildSupabasePoolerUrl(value, mode, poolerHost) {
  const url = new URL(value);
  const ref = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  if (ref) {
    url.username = `${url.username}.${ref}`;
  }

  url.hostname = poolerHost;
  url.port = mode === "transaction" ? "6543" : "5432";
  if (mode === "transaction") {
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", "1");
  } else {
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
  }
  return url.toString();
}

export function isDirectSupabaseDatabaseUrl(value) {
  if (!value) return false;
  try {
    return /^db\.[a-z0-9]+\.supabase\.co$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function isSharedPoolerWithPort(value, port) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return POOLER_HOST_PATTERN.test(url.hostname) && url.port === port;
  } catch {
    return false;
  }
}

function projectRefFromDatabaseUrl(value, key) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid Supabase PostgreSQL URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${key} must be a valid Supabase PostgreSQL URL.`);
  }
  const directRef = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  const poolerRef = POOLER_HOST_PATTERN.test(url.hostname)
    ? decodeURIComponent(url.username).match(/^[^.]+\.([a-z0-9]+)$/i)?.[1]
    : undefined;
  const ref = directRef ?? poolerRef;
  if (!ref) {
    throw new Error(`${key} must identify a Supabase project.`);
  }
  return ref.toLowerCase();
}
