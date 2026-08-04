import * as SecureStore from "expo-secure-store";

/**
 * App-state only - Clerk owns the actual session token via its own
 * tokenCache (see clerk-client.ts). This store just remembers which
 * household state the user was last on, keyed separately from
 * apps/mobile's "nexsteps.session" so both apps can be installed side by
 * side.
 */
export type AppStateSnapshot = {
  userId?: string;
  activeSiteId?: string;
  updatedAt: string;
};

let currentState: AppStateSnapshot | null = null;
const STATE_KEY = "nexsteps.home.session";

export async function getAppStateSnapshot(): Promise<AppStateSnapshot | null> {
  if (!currentState) {
    const raw = await SecureStore.getItemAsync(STATE_KEY);
    if (!raw) return null;
    try {
      currentState = JSON.parse(raw) as AppStateSnapshot;
    } catch {
      await SecureStore.deleteItemAsync(STATE_KEY);
      currentState = null;
      return null;
    }
  }
  return currentState;
}

export async function updateAppStateSnapshot(
  patch: Partial<Omit<AppStateSnapshot, "updatedAt">>,
): Promise<AppStateSnapshot> {
  currentState = {
    ...(currentState ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(STATE_KEY, JSON.stringify(currentState));
  return currentState;
}

export async function clearAppStateSnapshot(): Promise<void> {
  await SecureStore.deleteItemAsync(STATE_KEY);
  currentState = null;
}
