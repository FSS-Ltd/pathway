import assert from "node:assert/strict";
import {
  ApiError,
  cancelApiReads,
  createApiFetch,
  setApiTokenGetter,
} from "./api-transport";

const nativeFetch = globalThis.fetch;
const apiFetch = createApiFetch("http://api.test");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function run(): Promise<void> {
  const seen: string[] = [];
  globalThis.fetch = async (_input, init) => {
    seen.push(new Headers(init?.headers).get("Authorization") ?? "");
    return new Response("{}", { status: 200 });
  };

  let token = "first";
  setApiTokenGetter(async () => token);
  await apiFetch("http://api.test/auth/me");
  token = "second";
  await apiFetch("http://api.test/auth/me");
  assert.deepEqual(seen, ["Bearer first", "Bearer second"]);

  const waitForToken = deferred<string | null>();
  let tokenCalls = 0;
  setApiTokenGetter(() => {
    tokenCalls += 1;
    return waitForToken.promise;
  });
  const first = apiFetch("http://api.test/one");
  const second = apiFetch("http://api.test/two");
  waitForToken.resolve("shared");
  await Promise.all([first, second]);
  assert.equal(tokenCalls, 1);
  assert.deepEqual(seen.slice(-2), ["Bearer shared", "Bearer shared"]);

  const stalledToken = deferred<string | null>();
  let recoveryCalls = 0;
  setApiTokenGetter(() => {
    recoveryCalls += 1;
    return recoveryCalls === 1
      ? stalledToken.promise
      : Promise.resolve("recovered");
  });
  const cancelled = new AbortController();
  const waitingForToken = apiFetch("http://api.test/stalled", {
    signal: cancelled.signal,
  });
  cancelled.abort();
  await assert.rejects(
    Promise.race([
      waitingForToken,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("Token wait did not cancel")), 100),
      ),
    ]),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  await apiFetch("http://api.test/recovered");
  assert.equal(recoveryCalls, 2, "a stalled token must not block retry");
  assert.equal(seen.at(-1), "Bearer recovered");
  stalledToken.resolve("late-token");

  const oldSiteToken = deferred<string | null>();
  setApiTokenGetter(() => oldSiteToken.promise);
  const oldSiteRead = apiFetch("http://api.test/old-site");
  cancelApiReads();
  await assert.rejects(
    Promise.race([
      oldSiteRead,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("Site switch did not cancel")), 100),
      ),
    ]),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  oldSiteToken.resolve("old-site-token");

  seen.length = 0;
  tokenCalls = 0;
  setApiTokenGetter(async () => {
    tokenCalls += 1;
    return tokenCalls === 1 ? "expired" : "fresh";
  });
  globalThis.fetch = async (_input, init) => {
    seen.push(new Headers(init?.headers).get("Authorization") ?? "");
    return new Response("{}", { status: seen.length === 1 ? 401 : 200 });
  };
  assert.equal((await apiFetch("http://api.test/data")).status, 200);
  assert.deepEqual(seen, ["Bearer expired", "Bearer fresh"]);

  seen.length = 0;
  globalThis.fetch = async () => {
    seen.push("request");
    return new Response("{}", { status: 401 });
  };
  assert.equal(
    (await apiFetch("http://api.test/write", { method: "POST" })).status,
    401,
  );
  assert.equal(seen.length, 1, "writes are never replayed");

  seen.length = 0;
  globalThis.fetch = async () => {
    seen.push("request");
    return new Response("{}", { status: 403 });
  };
  assert.equal((await apiFetch("http://api.test/data")).status, 403);
  assert.equal(
    seen.length,
    1,
    "403 is a permission denial, not a token refresh",
  );

  const waitForSignOut = deferred<string | null>();
  setApiTokenGetter(() => waitForSignOut.promise);
  const inFlight = apiFetch("http://api.test/data");
  setApiTokenGetter(null);
  waitForSignOut.resolve("old-token");
  await assert.rejects(
    inFlight,
    (error: unknown) =>
      error instanceof ApiError && error.code === "SESSION_CHANGED",
  );

  setApiTokenGetter(async () => "current");
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      );
    });
  const scopedRead = apiFetch("http://api.test/scoped-data");
  await new Promise((resolve) => setTimeout(resolve, 0));
  cancelApiReads();
  await assert.rejects(
    scopedRead,
    /aborted/,
    "site changes cancel old scoped reads",
  );

  setApiTokenGetter(async () => "secret");
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), null);
    return new Response("{}", { status: 200 });
  };
  await apiFetch("https://external.test/resource");
}

run()
  .then(() => console.log("API token transport checks passed"))
  .finally(() => {
    setApiTokenGetter(null);
    globalThis.fetch = nativeFetch;
  });
