import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { SessionRuntime, useSession } from "./use-session-compat";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const nativeFetch = globalThis.fetch;
let session: ReturnType<typeof useSession>;
const currentData = () => session.data;

function Viewer() {
  session = useSession();
  return (
    <div data-status={session.status} data-id={session.data?.user.id ?? ""} />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 20));
  });
}

async function run(): Promise<void> {
  let failIdentity = true;
  let identityCalls = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/auth/me");
    assert.equal(init?.credentials, "include");
    identityCalls += 1;
    return new Response(
      JSON.stringify(
        failIdentity
          ? { code: "DATABASE_UNAVAILABLE" }
          : { userId: "internal-1" },
      ),
      { status: failIdentity ? 503 : 200 },
    );
  };

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  const delayedToken = deferred<string | null>();
  const getToken = () => delayedToken.promise;
  const render = async (
    isSignedIn: boolean,
    tokenGetter: () => Promise<string | null>,
    id = "clerk-1",
  ) => {
    await act(async () =>
      root.render(
        <React.StrictMode>
          <SessionRuntime
            isLoaded
            isSignedIn={isSignedIn}
            getToken={tokenGetter}
            identity={{ id, name: "Admin", email: "admin@example.test" }}
          >
            <Viewer />
          </SessionRuntime>
        </React.StrictMode>,
      ),
    );
  };

  await render(true, getToken);
  assert.equal(session.status, "loading");
  assert.equal(identityCalls, 0, "identity waits for the Clerk token");

  delayedToken.resolve("token");
  await settle();
  assert.equal(
    session.status,
    "error",
    "failed /auth/me is retryable, not authenticated",
  );
  assert.equal(
    session.data,
    null,
    "failed identity never creates an empty user id",
  );
  assert.equal(
    identityCalls,
    1,
    "Strict Mode does not duplicate identity lookup",
  );

  failIdentity = false;
  await act(async () => {
    await session.update();
  });
  assert.equal(session.status, "authenticated");
  assert.equal(currentData()?.user.id, "internal-1");

  await render(true, () => Promise.resolve("refreshed-token"));
  await settle();
  assert.equal(session.status, "authenticated");
  assert.equal(identityCalls, 2, "token getter updates do not reload identity");

  const lateToken = deferred<string | null>();
  await render(true, () => lateToken.promise, "clerk-2");
  assert.equal(session.status, "loading");
  await render(false, () => Promise.resolve(null), "clerk-2");
  lateToken.resolve("old-token");
  await settle();
  assert.equal(session.status, "unauthenticated");
  assert.equal(
    session.data,
    null,
    "late sign-in cannot restore a signed-out identity",
  );

  await act(async () => root.unmount());
}

run()
  .then(() => console.log("session runtime checks passed"))
  .finally(() => {
    globalThis.fetch = nativeFetch;
    dom.window.close();
  });
