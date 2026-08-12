import * as SecureStore from "expo-secure-store";

import {
  activateAndReadPaceDraft,
  clearPaceDraft,
  writePaceDraft,
  type PaceDraftScope,
} from "./pace-draft-store";

const scope: PaceDraftScope = { userId: "user-1", siteId: "site-1" };
const secondScope: PaceDraftScope = { userId: "user-1", siteId: "site-2" };
const storageKey = "ace-pace-draft-v1:user-1:site-1";

function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: () => resolve?.() };
}

beforeEach(() => {
  jest.spyOn(SecureStore, "getItemAsync").mockResolvedValue(null);
  jest.spyOn(SecureStore, "setItemAsync").mockResolvedValue();
  jest.spyOn(SecureStore, "deleteItemAsync").mockResolvedValue();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("does not recreate a cleared draft when an earlier write resolves late", async () => {
  const pendingWrite = deferred();
  jest
    .spyOn(SecureStore, "setItemAsync")
    .mockImplementationOnce(() => pendingWrite.promise);
  await activateAndReadPaceDraft(scope);

  const writing = writePaceDraft(scope, "before-logout");
  await Promise.resolve();
  await Promise.resolve();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    storageKey,
    "before-logout",
  );
  const clearing = clearPaceDraft(scope);
  pendingWrite.resolve();

  await Promise.all([writing, clearing]);

  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(storageKey);
  await writePaceDraft(scope, "after-logout");
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
});

it("reads the latest A draft after an A-to-B-to-A reactivation", async () => {
  const stored = new Map([[storageKey, "stale-A"]]);
  const pendingLatestWrite = deferred();
  jest
    .spyOn(SecureStore, "getItemAsync")
    .mockImplementation(async (key) => stored.get(key) ?? null);
  jest
    .spyOn(SecureStore, "setItemAsync")
    .mockImplementationOnce(async (key, value) => {
      await pendingLatestWrite.promise;
      stored.set(key, value);
    });

  await activateAndReadPaceDraft(scope);
  const latestWrite = writePaceDraft(scope, "latest-A");
  await Promise.resolve();
  await Promise.resolve();
  await activateAndReadPaceDraft(secondScope);
  const restoredDraft = activateAndReadPaceDraft(scope);
  pendingLatestWrite.resolve();

  await latestWrite;
  await expect(restoredDraft).resolves.toBe("latest-A");
});
