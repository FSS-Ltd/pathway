import Constants from "expo-constants";

type MobileExtra = {
  apiUrl?: string;
  auth0Domain?: string;
  auth0ClientId?: string;
  auth0Audience?: string;
  auth0Scope?: string;
  auth0CustomScheme?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as MobileExtra;

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
        "nexsteps",
    ),
  },
};

export function assertEnv() {
  if (!env.apiUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is required for mobile API calls.");
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
