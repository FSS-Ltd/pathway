import * as SecureStore from "expo-secure-store";
import type { TokenCache } from "@clerk/clerk-expo";

/**
 * Persists Clerk's session token in SecureStore. Everything else that
 * auth0-client.ts used to do by hand (universal-login redirect, token
 * refresh, credential storage) is now internal to @clerk/clerk-expo -
 * ClerkProvider + its hooks (useAuth, useSignIn, useSSO) replace it.
 */
export const clerkTokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, token: string) {
    try {
      await SecureStore.setItemAsync(key, token);
    } catch {
      // Best-effort: a failed write just means the user re-authenticates
      // next launch instead of resuming a session.
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing to clean up.
    }
  },
};
