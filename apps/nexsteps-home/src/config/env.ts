import Constants from "expo-constants";

type HomeExtra = {
  apiUrl?: string;
  auth0Domain?: string;
  auth0ClientId?: string;
  auth0Audience?: string;
  auth0Scope?: string;
  auth0CustomScheme?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as HomeExtra;

function isTemplatePlaceholder(value: string | undefined): boolean {
  return Boolean(value && /^\$\{.+\}$/.test(value.trim()));
}

function clean(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (isTemplatePlaceholder(trimmed)) return "";
  return trimmed;
}

function normalizeAuth0Domain(raw?: string): string {
  return clean(raw).replace(/^https?:\/\//, "");
}

function getApiHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isUnsupportedLocalApiHost(hostname: string): boolean {
  return hostname === "api.127.0.0.1" || hostname.endsWith(".127.0.0.1");
}

export const env = {
  apiUrl: clean(
    process.env.EXPO_PUBLIC_API_URL ??
      process.env.AUTH0_MOBILE_API_URL ??
      extra.apiUrl ??
      "http://localhost:3001",
  ),
  auth0: {
    domain: normalizeAuth0Domain(
      process.env.EXPO_PUBLIC_AUTH0_DOMAIN ??
        process.env.AUTH0_MOBILE_DOMAIN ??
        process.env.AUTH0_ISSUER ??
        extra.auth0Domain,
    ),
    clientId: clean(
      process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ??
        process.env.AUTH0_MOBILE_CLIENT_ID ??
        extra.auth0ClientId ??
        "",
    ),
    audience: clean(
      process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ??
        process.env.AUTH0_MOBILE_AUDIENCE ??
        process.env.AUTH0_AUDIENCE ??
        extra.auth0Audience ??
        "",
    ),
    scope: clean(
      process.env.EXPO_PUBLIC_AUTH0_SCOPE ??
        process.env.AUTH0_MOBILE_SCOPE ??
        extra.auth0Scope ??
        "openid profile email offline_access",
    ),
    customScheme: clean(
      process.env.EXPO_PUBLIC_AUTH0_CUSTOM_SCHEME ??
        process.env.AUTH0_MOBILE_CUSTOM_SCHEME ??
        extra.auth0CustomScheme ??
        "nexstepshome",
    ),
  },
};

export function assertEnv() {
  if (!env.apiUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is required for NexSteps Home API calls.");
  }

  const apiHostname = getApiHostname(env.apiUrl);
  if (apiHostname && isUnsupportedLocalApiHost(apiHostname)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL host "${apiHostname}" is not supported for local mobile dev. Use "https://api.localhost:3003" for iOS simulator.`,
    );
  }

  if (!env.auth0.domain) {
    throw new Error(
      "AUTH0 mobile domain is required (and must not be a literal ${...} placeholder).",
    );
  }

  if (!env.auth0.clientId) {
    throw new Error("AUTH0 mobile client id is required.");
  }
}
