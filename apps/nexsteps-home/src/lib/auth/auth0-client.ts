import { env } from "@/config/env";
import Constants from "expo-constants";
import {
  clearSessionSnapshot,
  getSessionSnapshot,
  setSessionSnapshot,
  updateSessionSnapshot,
  type SessionSnapshot,
} from "@/lib/auth/session-store";
import { Platform } from "react-native";

type Auth0Credentials = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

type Auth0Client = {
  webAuth: {
    authorize: (
      parameters?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<Auth0Credentials>;
    clearSession: (
      parameters?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<void>;
  };
  auth: {
    refreshToken: (options: {
      refreshToken: string;
      audience?: string;
      scope?: string;
    }) => Promise<Auth0Credentials>;
  };
};

async function getAuth0Client(): Promise<Auth0Client> {
  let moduleRef: unknown;
  try {
    moduleRef = await import("react-native-auth0");
  } catch {
    const friendly = new Error(
      "Auth0 module import failed. Ensure this is a rebuilt custom dev client (not Expo Go).",
    );
    (friendly as { name?: string }).name = "Auth0NativeModuleUnavailable";
    throw friendly;
  }

  try {
    const module = moduleRef as { default?: unknown };
    const Auth0Ctor = (module.default ?? module) as new (config: {
      domain: string;
      clientId: string;
    }) => Auth0Client;

    const client = new Auth0Ctor({
      domain: env.auth0.domain,
      clientId: env.auth0.clientId,
    });
    return client;
  } catch {
    const friendly = new Error(
      "Auth0 initialization failed in this runtime. Check AUTH0_MOBILE_CLIENT_ID/domain and confirm the dev client was rebuilt after native config changes.",
    );
    (friendly as { name?: string }).name = "Auth0NativeModuleUnavailable";
    throw friendly;
  }
}

function toIsoFromSeconds(expiresIn?: number | null): string | undefined {
  if (!expiresIn || Number.isNaN(expiresIn)) return undefined;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function loginWithAuth0UniversalLogin() {
  const auth0 = await getAuth0Client();
  const nativeAppId =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package;
  const expectedRedirectUri =
    nativeAppId && env.auth0.domain && env.auth0.customScheme
      ? `${env.auth0.customScheme}://${env.auth0.domain}/${Platform.OS}/${nativeAppId.toLowerCase()}/callback`
      : undefined;
  const options = {
    customScheme: env.auth0.customScheme,
  };
  const parameters = {
    audience: env.auth0.audience || undefined,
    scope: env.auth0.scope,
    redirectUrl: expectedRedirectUri,
  };
  const credentials = await auth0.webAuth.authorize(parameters, options);

  await setSessionSnapshot({
    accessToken: credentials.accessToken,
    idToken: credentials.idToken,
    refreshToken: credentials.refreshToken,
    expiresAt: toIsoFromSeconds(credentials.expiresIn),
  });

  return credentials;
}

export async function refreshAccessTokenIfNeeded(
  snapshot: SessionSnapshot,
): Promise<SessionSnapshot> {
  if (!snapshot.expiresAt) return snapshot;

  const expiresAt = new Date(snapshot.expiresAt).getTime();
  const shouldRefresh = Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;

  if (!shouldRefresh) return snapshot;
  if (!snapshot.refreshToken) return snapshot;

  const auth0 = await getAuth0Client();
  const refreshed = await auth0.auth.refreshToken({
    refreshToken: snapshot.refreshToken,
    audience: env.auth0.audience || undefined,
    scope: env.auth0.scope,
  });

  const updated = await updateSessionSnapshot({
    accessToken: refreshed.accessToken,
    idToken: refreshed.idToken,
    refreshToken: refreshed.refreshToken ?? snapshot.refreshToken,
    expiresAt: toIsoFromSeconds(refreshed.expiresIn),
  });

  return updated ?? snapshot;
}

export async function getValidSessionSnapshot(): Promise<SessionSnapshot | null> {
  const snapshot = await getSessionSnapshot();
  if (!snapshot) return null;

  try {
    return await refreshAccessTokenIfNeeded(snapshot);
  } catch {
    // Refresh can fail if refresh token is revoked/expired; force clean sign-in.
    await clearSessionSnapshot();
    return null;
  }
}

export async function logoutFromAuth0() {
  // Local-first logout: clears the app session without forcing a web auth sheet prompt.
  await clearSessionSnapshot();
}
