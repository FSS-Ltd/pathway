import * as SecureStore from "expo-secure-store";

import {
  activatePaceDraftScope,
  clearPaceDraft,
  writePaceDraft,
  type PaceDraftScope,
} from "./pace-draft-store";

const scope: PaceDraftScope = { userId: "user-1", siteId: "site-1" };
const storageKey = "ace-pace-draft-v1:user-1:site-1";

function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: () => resolve?.() };
}

beforeEach(() => {
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
  activatePaceDraftScope(scope);

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
