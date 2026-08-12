import * as SecureStore from "expo-secure-store";

const PACE_DRAFT_KEY_PREFIX = "ace-pace-draft-v1";

export type PaceDraftScope = {
  userId: string;
  siteId: string;
};

export function resolvePaceDraftScope(
  userId: string | undefined,
  siteId: string | null,
): PaceDraftScope | null {
  if (!userId || !siteId) return null;
  return { userId, siteId };
}

export function paceDraftStorageKey(scope: PaceDraftScope): string {
  return `${PACE_DRAFT_KEY_PREFIX}:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.siteId)}`;
}

export function readPaceDraft(scope: PaceDraftScope): Promise<string | null> {
  return SecureStore.getItemAsync(paceDraftStorageKey(scope));
}

export function writePaceDraft(
  scope: PaceDraftScope,
  draft: string,
): Promise<void> {
  return SecureStore.setItemAsync(paceDraftStorageKey(scope), draft);
}

export function clearPaceDraft(scope: PaceDraftScope): Promise<void> {
  return SecureStore.deleteItemAsync(paceDraftStorageKey(scope));
}
