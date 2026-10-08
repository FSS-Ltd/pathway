import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AdminContextRuntime } from "@/lib/admin-context";
import type { SessionContextValue } from "@/lib/use-session-compat";
import RolesAdminPage from "./page";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/settings/roles",
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
let failPeople = true;
const session: SessionContextValue = {
  data: { accessToken: "test", user: { id: "user-1", name: "Admin" } },
  status: "authenticated",
  error: null,
  update: async () => undefined,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "support-123",
    },
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function run(): Promise<void> {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/auth/active-site") {
      return response({
        activeSiteId: "site-1",
        sites: [{ id: "site-1", name: "One", orgId: "org-1" }],
      });
    }
    if (path === "/auth/active-site/roles") {
      return response({
        userId: "user-1",
        superUser: false,
        orgRoles: [],
        siteRoles: [],
        orgMemberships: [{ orgId: "org-1", orgName: "One", role: "ORG_ADMIN" }],
        siteMemberships: [],
      });
    }
    if (path === "/platform/capabilities") {
      return response({ capabilities: ["platform.access.roles.read"] });
    }
    if (path === "/access/users/me/permissions") {
      return response({ permissions: ["platform.access.roles.read"] });
    }
    if (path === "/orgs") {
      return response([{ id: "org-1", name: "One", vertical: "ACE_SCHOOL" }]);
    }
    if (path === "/access/roles") {
      return response([
        {
          id: "role-1",
          name: "Administrator",
          description: null,
          scope: "organisation",
          isSystem: true,
          isActive: true,
          tenantId: null,
          permissions: ["platform.access.roles.read"],
        },
      ]);
    }
    if (path === "/orgs/org-1/people") {
      return failPeople
        ? response({ detail: "private database trace" }, 503)
        : response([]);
    }
    if (path === "/access/assignments") {
      return response({ items: [], nextCursor: null });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <AdminContextRuntime session={session}>
          <RolesAdminPage />
        </AdminContextRuntime>,
      );
    });
    await settle();
    assert.match(container.textContent ?? "", /Administrator/);
    assert.doesNotMatch(container.textContent ?? "", /private database trace/);

    const assignments = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Assignments",
    );
    assert.ok(assignments);
    await act(async () => assignments.click());
    assert.match(container.textContent ?? "", /Unable to load people/);
    assert.match(container.textContent ?? "", /support-123/);

    failPeople = false;
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Retry",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    await settle();
    assert.doesNotMatch(container.textContent ?? "", /Unable to load people/);
    assert.match(container.textContent ?? "", /Assign/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = nativeFetch;
  }
}

void run().then(
  () => process.stdout.write("roles page partial failure: passed\n"),
  (error: unknown) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  },
);
