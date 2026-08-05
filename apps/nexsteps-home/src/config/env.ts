import Constants from "expo-constants";

type HomeExtra = {
  apiUrl?: string;
  clerkPublishableKey?: string;
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
  apiUrl: clean(process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "http://localhost:3001"),
  clerkPublishableKey: clean(
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? extra.clerkPublishableKey ?? "",
  ),
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

  if (!env.clerkPublishableKey) {
    throw new Error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required (and must not be a literal ${...} placeholder).",
    );
  }
}
