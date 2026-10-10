import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AdminContextRuntime } from "@/lib/admin-context";
import { setApiClientToken } from "@/lib/api-client";
import type { SessionContextValue } from "@/lib/use-session-compat";
import { NoticeEditor } from "./notice-editor";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/notices/new",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Event: dom.window.Event,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const session: SessionContextValue = {
  data: { accessToken: "legacy", user: { id: "publisher", name: "Publisher" } },
  status: "authenticated",
  error: null,
  update: async () => undefined,
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function changeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    Simulate.change(element);
  });
}

async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  assert.ok(button, `Missing ${label} button`);
  await act(async () => button.click());
  return button;
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let draftRevision = 0;
  let publishCalls = 0;
  let recipientCount = 0;
  setApiClientToken("notice-test-token");
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    if (route === "GET /auth/active-site")
      return response({
        activeSiteId: "site-1",
        sites: [
          { id: "site-1", name: "School", orgId: "org-1", orgName: "Org" },
        ],
      });
    if (route === "GET /auth/active-site/roles")
      return response({
        userId: "publisher",
        superUser: false,
        currentOrgIsMasterOrg: false,
        orgRoles: [],
        siteRoles: [],
        orgMemberships: [],
        siteMemberships: [],
      });
    if (route === "GET /platform/capabilities")
      return response({ capabilities: [] });
    if (route === "GET /access/users/me/permissions")
      return response({ permissions: ["notices.publish"] });
    if (route === "GET /orgs")
      return response([
        { id: "org-1", name: "Org", vertical: "ACE_SCHOOL", sector: "SCHOOL" },
      ]);
    if (route === "GET /ace/notices/targets")
      return response({ available: true, items: [] });
    if (
      route === "POST /ace/notices/drafts" ||
      route === "PUT /ace/notices/drafts/notice-1"
    ) {
      draftRevision += 1;
      return response({
        id: "notice-1",
        updatedAt: `2026-10-10T10:00:0${draftRevision}.000Z`,
      });
    }
    if (route === "GET /ace/notices/drafts/notice-1/audience-preview")
      return response({
        recipientCount,
        audienceVersion: "a".repeat(64),
        updatedAt: `2026-10-10T10:00:0${draftRevision}.000Z`,
      });
    if (route === "POST /ace/notices/notice-1/publish") {
      publishCalls += 1;
      return response({ message: "Audience changed" }, 409);
    }
    throw new Error(`Unexpected request: ${route}`);
  };

  try {
    await act(async () =>
      root.render(
        <AppRouterContext.Provider
          value={{
            back: () => undefined,
            forward: () => undefined,
            refresh: () => undefined,
            push: () => undefined,
            replace: () => undefined,
            prefetch: async () => undefined,
          }}
        >
          <AdminContextRuntime session={session}>
            <NoticeEditor />
          </AdminContextRuntime>
        </AppRouterContext.Provider>,
      ),
    );
    const title = container.querySelector<HTMLInputElement>("#notice-title");
    const body = container.querySelector<HTMLTextAreaElement>("#notice-body");
    assert.ok(title && body);
    await changeValue(title, "School update");
    await changeValue(body, "This is a notice for families and staff.");
    assert.equal(title.value, "School update");
    assert.equal(body.value, "This is a notice for families and staff.");
    await clickButton(container, "Review audience");
    assert.equal(draftRevision, 1, container.textContent ?? "");
    let publish = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Publish now",
    );
    assert.ok(publish, container.textContent ?? "");
    assert.equal(publish.disabled, true, "empty audiences cannot publish");
    recipientCount = 3;
    await clickButton(container, "Review audience");
    assert.equal(publish.disabled, false);
    await clickButton(container, "Publish now");
    assert.equal(publishCalls, 1);
    await clickButton(container, "Review audience");
    assert.match(container.textContent ?? "", /reviewed the current audience/);
    publish = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Publish now",
    );
    assert.ok(publish);
    assert.equal(publish.disabled, true, "a conflict needs fresh confirmation");
    const firstConfirmation = [...container.querySelectorAll("label")]
      .find((item) =>
        item.textContent?.includes("reviewed the current audience"),
      )
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    assert.ok(firstConfirmation);
    await act(async () => firstConfirmation.click());
    assert.equal(publish.disabled, false);
    const audience =
      container.querySelector<HTMLSelectElement>("#notice-audience");
    assert.ok(audience);
    await changeValue(audience, "PARENTS");
    await clickButton(container, "Review audience");
    const confirmation = [...container.querySelectorAll("label")]
      .find((item) =>
        item.textContent?.includes("reviewed the current audience"),
      )
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    assert.match(container.textContent ?? "", /reviewed the current audience/);
    publish = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Publish now",
    );
    assert.ok(publish);
    assert.equal(publish.disabled, true);
    const scheduledAt = container.querySelector<HTMLInputElement>(
      "#notice-scheduled-at",
    );
    assert.ok(scheduledAt);
    await changeValue(scheduledAt, "2030-10-10T10:00");
    const schedule = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Schedule notice",
    );
    assert.ok(schedule);
    assert.equal(schedule.disabled, true);
    assert.ok(confirmation);
    await act(async () => {
      confirmation.click();
    });
    assert.equal(publish.disabled, false);
    assert.equal(schedule.disabled, false);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
