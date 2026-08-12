import * as SecureStore from "expo-secure-store";

const PACE_DRAFT_KEY_PREFIX = "ace-pace-draft-v1";

export type PaceDraftScope = {
  userId: string;
  siteId: string;
};

type DraftOperationState = {
  generation: number;
  isActive: boolean;
  queue: Promise<void>;
};

const operationStates = new Map<string, DraftOperationState>();

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

export function activateAndReadPaceDraft(
  scope: PaceDraftScope,
): Promise<string | null> {
  const key = paceDraftStorageKey(scope);
  const state = stateFor(key);
  state.isActive = true;
  const generation = state.generation;
  return serialize(key, async () => {
    const current = stateFor(key);
    if (!current.isActive || current.generation !== generation) return null;
    return SecureStore.getItemAsync(key);
  });
}

export function writePaceDraft(
  scope: PaceDraftScope,
  draft: string,
): Promise<void> {
  const key = paceDraftStorageKey(scope);
  const state = stateFor(key);
  const generation = state.generation;
  return serialize(key, async () => {
    const current = stateFor(key);
    if (!current.isActive || current.generation !== generation) return;
    await SecureStore.setItemAsync(key, draft);
  });
}

export function clearPaceDraft(scope: PaceDraftScope): Promise<void> {
  const key = paceDraftStorageKey(scope);
  const state = stateFor(key);
  state.generation += 1;
  state.isActive = false;
  return serialize(key, () => SecureStore.deleteItemAsync(key));
}

function stateFor(key: string): DraftOperationState {
  const existing = operationStates.get(key);
  if (existing) return existing;

  const state = { generation: 0, isActive: false, queue: Promise.resolve() };
  operationStates.set(key, state);
  return state;
}

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const state = stateFor(key);
  const next = state.queue.catch(() => undefined).then(operation);
  state.queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
