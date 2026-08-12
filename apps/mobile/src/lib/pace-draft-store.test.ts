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

it("drains every retained A write before an A-to-B-to-A reactivation reads", async () => {
  const stored = new Map([[storageKey, "stale-A"]]);
  const pendingFirstWrite = deferred();
  jest
    .spyOn(SecureStore, "getItemAsync")
    .mockImplementation(async (key) => stored.get(key) ?? null);
  jest
    .spyOn(SecureStore, "setItemAsync")
    .mockImplementationOnce(async (key, value) => {
      await pendingFirstWrite.promise;
      stored.set(key, value);
    })
    .mockImplementation(async (key, value) => {
      stored.set(key, value);
    });

  await activateAndReadPaceDraft(scope);
  const firstWrite = writePaceDraft(scope, "first-A");
  await Promise.resolve();
  await Promise.resolve();
  const latestWrite = writePaceDraft(scope, "latest-A");
  await activateAndReadPaceDraft(secondScope);
  const restoredDraft = activateAndReadPaceDraft(scope);
  pendingFirstWrite.resolve();

  await Promise.all([firstWrite, latestWrite]);
  await expect(restoredDraft).resolves.toBe("latest-A");
});
