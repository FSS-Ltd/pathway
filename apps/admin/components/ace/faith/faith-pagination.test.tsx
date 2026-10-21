import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AdminContextRuntime } from "@/lib/admin-context";
import type { SessionContextValue } from "@/lib/use-session-compat";
import { FaithWorkspace } from "./faith-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/faith",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const session: SessionContextValue = {
  data: {
    accessToken: "test-token",
    user: { id: "staff-one", name: "Staff One" },
  },
  status: "authenticated",
  error: null,
  update: async () => undefined,
};
const item = (id: string, title: string) => ({
  id,
  title,
  latestVersionId: null,
  latestVersionNumber: 0,
  withdrawnAt: null,
  publishedNeedsReview: false,
  publishedVersion: null,
  drafts: [],
});
const page = (items: ReturnType<typeof item>[], nextCursor: string | null) => ({
  items,
  nextCursor,
  siteLead: false,
  authoringEnabled: true,
  publicationEnabled: false,
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name,
  );
  assert.ok(found, `expected ${name} button`);
  return found;
}

async function run() {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let failNextPage = true;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}${url.search}`);
    switch (url.pathname) {
      case "/auth/active-site":
        return response({
          activeSiteId: "site-one",
          sites: [
            { id: "site-one", name: "ACE", orgId: "org-one", orgName: "Org" },
          ],
        });
      case "/auth/active-site/roles":
        return response({
          userId: "staff-one",
          superUser: false,
          currentOrgIsMasterOrg: false,
          orgRoles: [],
          siteRoles: [],
          orgMemberships: [{ orgId: "org-one", orgName: "Org", role: "STAFF" }],
          siteMemberships: [
            { orgId: "org-one", tenantId: "site-one", role: "STAFF" },
          ],
        });
      case "/platform/capabilities":
        return response({ capabilities: ["ace.faith.manage"] });
      case "/access/users/me/permissions":
        return response({ permissions: ["ace.faith.manage"] });
      case "/orgs":
        return response([
          {
            id: "org-one",
            name: "Org",
            vertical: "ACE_SCHOOL",
            sector: "SCHOOL",
          },
        ]);
      case "/ace/faith/content":
        if (url.searchParams.has("cursor")) {
          assert.equal(url.searchParams.get("cursor"), "first");
          assert.equal(url.searchParams.get("limit"), "50");
          if (failNextPage)
            return response({ message: "Temporary failure" }, 503);
          return response(page([item("second", "Second content")], null));
        }
        return response(page([item("first", "First content")], "first"));
      case "/ace/faith/options":
        return response({ ageBands: [] });
      case "/ace/faith/settings":
        return response({
          displayLabel: "Faith Corner",
          reflectionsEnabled: false,
          reflectionFeatureAvailable: false,
        });
      default:
        throw new Error(`Unexpected request ${url.pathname}`);
    }
  };
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <AdminContextRuntime session={session}>
          <FaithWorkspace />
        </AdminContextRuntime>,
      ),
    );
    await settle();
    assert.match(container.textContent ?? "", /First content/);
    assert.doesNotMatch(container.textContent ?? "", /Second content/);
    assert.ok(
      requests.includes("/ace/faith/content"),
      "initial fetch keeps the default page route",
    );
    await act(async () => button(container, "Load more").click());
    await settle();
    assert.match(
      container.textContent ?? "",
      /Unable to load more faith content/,
    );
    assert.match(container.textContent ?? "", /First content/);
    failNextPage = false;
    await act(async () => button(container, "Load more").click());
    await settle();
    assert.match(container.textContent ?? "", /First content/);
    assert.match(container.textContent ?? "", /Second content/);
    assert.equal(
      container.querySelectorAll("#faith-content-list > li").length,
      2,
    );
    assert.doesNotMatch(
      container.textContent ?? "",
      /Unable to load more faith content/,
    );
    assert.equal(
      Array.from(container.querySelectorAll("button")).some(
        (node) => node.textContent?.trim() === "Load more",
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await act(async () => root.unmount());
    container.remove();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
