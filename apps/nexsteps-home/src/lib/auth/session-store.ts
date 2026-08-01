import * as SecureStore from "expo-secure-store";

export type SessionSnapshot = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  userId?: string;
  activeSiteId?: string;
  expiresAt?: string;
  updatedAt: string;
};

let currentSession: SessionSnapshot | null = null;
// Namespaced separately from apps/mobile's "nexsteps.session" so both apps
// can be installed side by side during rollout.
const SESSION_KEY = "nexsteps.home.session";

function isExpired(snapshot: SessionSnapshot): boolean {
  if (!snapshot.expiresAt) return false;
  const expiresAt = new Date(snapshot.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= Date.now();
}

export async function getSessionSnapshot(): Promise<SessionSnapshot | null> {
  if (!currentSession) {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    try {
      currentSession = JSON.parse(raw) as SessionSnapshot;
    } catch {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      currentSession = null;
      return null;
    }
  }

  if (!currentSession) return null;
  if (isExpired(currentSession)) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    currentSession = null;
    return null;
  }
  return currentSession;
}

export async function setSessionSnapshot(
  session: Omit<SessionSnapshot, "updatedAt">,
): Promise<SessionSnapshot> {
  currentSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(currentSession));
  return currentSession;
}

export async function updateSessionSnapshot(
  patch: Partial<Omit<SessionSnapshot, "updatedAt">>,
): Promise<SessionSnapshot | null> {
  const existing = await getSessionSnapshot();
  if (!existing) return null;

  currentSession = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(currentSession));

  return currentSession;
}

export async function clearSessionSnapshot(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  currentSession = null;
}
