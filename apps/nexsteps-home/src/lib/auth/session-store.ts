import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store has no web implementation (Keychain/Keystore have no web
// equivalent - see the package's own docs). localStorage is the standard
// fallback for the web target's dev/preview builds; it isn't as secure as
// native, an accepted tradeoff every web app session store makes.
const store = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

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
    const raw = await store.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      currentSession = JSON.parse(raw) as SessionSnapshot;
    } catch {
      await store.deleteItem(SESSION_KEY);
      currentSession = null;
      return null;
    }
  }

  if (!currentSession) return null;
  if (isExpired(currentSession)) {
    await store.deleteItem(SESSION_KEY);
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
  await store.setItem(SESSION_KEY, JSON.stringify(currentSession));
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
  await store.setItem(SESSION_KEY, JSON.stringify(currentSession));

  return currentSession;
}

export async function clearSessionSnapshot(): Promise<void> {
  await store.deleteItem(SESSION_KEY);
  currentSession = null;
}
