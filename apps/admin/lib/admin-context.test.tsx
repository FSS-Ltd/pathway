import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AdminContextRuntime, useAdminContext } from "./admin-context";
import { useAdminAccess } from "./use-admin-access";
import { useOrgUi } from "./use-org-ui";
import type { SessionContextValue } from "./use-session-compat";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const nativeFetch = globalThis.fetch;
const sites = [
  { id: "site-a", name: "A", orgId: "org-1", orgName: "One" },
  { id: "site-b", name: "B", orgId: "org-1", orgName: "One" },
];
const counts = new Map<string, number>();
let activeSiteId: string | null = "site-a";
let userId = "user-a";
let failPermissions = false;
let failSwitch = false;
let delayedPermission: Promise<Response> | null = null;
let permissionOverride: string[] | null = null;
let context: ReturnType<typeof useAdminContext>;
const currentStatus = () => context.state.status;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function Viewer() {
  context = useAdminContext();
  const access = useAdminAccess();
  const org = useOrgUi();
  return (
    <div
      data-status={context.state.status}
      data-site={
        context.state.status === "ready"
          ? context.state.snapshot.activeSiteId
          : ""
      }
      data-permissions={access.permissions?.join(",") ?? ""}
      data-admin={String(access.role.isOrgAdmin)}
      data-org-key={org.key}
    />
  );
}

const sessionFor = (id: string): SessionContextValue => ({
  data: { accessToken: "legacy", user: { id, name: id } },
  status: "authenticated",
  error: null,
  update: async () => undefined,
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function run(): Promise<void> {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    assert.equal(
      init?.credentials,
      "include",
      `${route} sends the site cookie`,
    );
    counts.set(route, (counts.get(route) ?? 0) + 1);
    if (route === "GET /auth/active-site")
      return response({ activeSiteId, sites });
    if (route === "POST /auth/active-site") {
      if (failSwitch) return response({ code: "SITE_SWITCH_FAILED" }, 503);
      activeSiteId = JSON.parse(String(init?.body)).siteId as string;
      return response({ activeSiteId, sites });
    }
    if (route === "GET /auth/active-site/roles") {
      return response({
        userId,
        superUser: false,
        currentOrgIsMasterOrg: false,
        orgRoles: [{ orgId: "other-org", role: "ORG_ADMIN" }],
        siteRoles: [],
        orgMemberships: [{ orgId: "org-1", orgName: "One", role: "STAFF" }],
        siteMemberships: [],
      });
    }
    if (route === "GET /platform/capabilities")
      return response({ capabilities: ["ace.dashboard.read"] });
    if (route === "GET /access/users/me/permissions") {
      if (delayedPermission) {
        const delayed = delayedPermission;
        delayedPermission = null;
        return delayed;
      }
      return failPermissions
        ? response({ code: "DATABASE_UNAVAILABLE" }, 503)
        : response({
            permissions: permissionOverride ?? [
              activeSiteId === "site-a" ? "permission.a" : "permission.b",
            ],
          });
    }
    if (route === "GET /orgs")
      return response([
        {
          id: "org-1",
          name: "One",
          vertical: "ACE_SCHOOL",
          sector: "SCHOOL",
        },
      ]);
    throw new Error(`Unexpected request: ${route}`);
  };

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  const render = async (session: SessionContextValue) => {
    await act(async () =>
      root.render(
        <React.StrictMode>
          <AdminContextRuntime session={session}>
            <Viewer />
          </AdminContextRuntime>
        </React.StrictMode>,
      ),
    );
    await settle();
  };

  await render(sessionFor("user-a"));
  assert.equal(currentStatus(), "ready");
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-site"),
    "site-a",
  );
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-admin"),
    "false",
    "roles in another organisation must not grant admin status",
  );
  for (const route of [
    "GET /auth/active-site",
    "GET /auth/active-site/roles",
    "GET /platform/capabilities",
    "GET /access/users/me/permissions",
    "GET /orgs",
  ]) {
    assert.equal(
      counts.get(route),
      1,
      `${route} loads once with three consumers and Strict Mode`,
    );
  }

  await render(sessionFor("user-a"));
  assert.equal(
    counts.get("GET /auth/active-site"),
    1,
    "same user navigation does not rebootstrap",
  );

  let releaseOldPermission!: (value: Response) => void;
  delayedPermission = new Promise<Response>((resolve) => {
    releaseOldPermission = resolve;
  });
  let staleRefresh!: Promise<void>;
  await act(async () => {
    staleRefresh = context.refreshAccess();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await context.switchSite("site-b");
  });
  releaseOldPermission(response({ permissions: ["permission.a"] }));
  await act(async () => {
    await staleRefresh;
  });
  assert.equal(currentStatus(), "ready");
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-permissions"),
    "permission.b",
    "site switch replaces previous grants",
  );

  failSwitch = true;
  await act(async () => {
    await context.switchSite("site-a");
  });
  assert.equal(
    currentStatus(),
    "ready",
    "failed site switch keeps the verified context",
  );
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-site"),
    "site-b",
  );
  failSwitch = false;

  failPermissions = true;
  await act(async () => {
    await context.refreshAccess();
  });
  assert.equal(
    currentStatus(),
    "ready",
    "background failure retains the verified snapshot",
  );
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-permissions"),
    "permission.b",
  );

  failPermissions = false;
  permissionOverride = [];
  await act(async () => {
    await context.refreshAccess();
  });
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-permissions"),
    "",
    "successful refresh removes revoked grants",
  );
  permissionOverride = null;

  failPermissions = true;
  userId = "user-b";
  await render(sessionFor("user-b"));
  assert.equal(currentStatus(), "error", "failed access cannot become ready");
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-permissions"),
    "",
    "previous user's grants cannot appear after identity change",
  );

  failPermissions = false;
  await act(async () => {
    await context.retry();
  });
  assert.equal(
    currentStatus(),
    "ready",
    "retry recovers without a document reload",
  );

  activeSiteId = null;
  userId = "user-c";
  await render(sessionFor("user-c"));
  assert.equal(currentStatus(), "no-active-site");
  assert.equal(
    document.querySelector("[data-status]")?.getAttribute("data-permissions"),
    "",
  );

  await render({
    data: null,
    status: "unauthenticated",
    error: null,
    update: async () => undefined,
  });
  assert.equal(currentStatus(), "unauthenticated");
  await act(async () => root.unmount());
}

run()
  .then(() => console.log("admin context runtime checks passed"))
  .finally(() => {
    globalThis.fetch = nativeFetch;
    dom.window.close();
  });
