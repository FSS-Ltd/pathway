import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { AgreementAssignment } from "@pathway/types";
import { setApiTokenGetter } from "@/lib/api-transport";
import { AgreementsWorkspace } from "./workspace";
import { AssignmentCard } from "./assignment-card";
import { AssignForm } from "./assign-form";
import { PublishForm } from "./publish-form";
import { resolveAdminNavItems } from "@/app/admin-navigation";
import { resolveOrgUi } from "@/lib/org-ui";
const dom = new JSDOM("<html><body></body></html>", {
  url: "http://localhost/compliance/agreements",
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
const assignment: AgreementAssignment = {
  id: "assignment",
  version: {
    id: "version",
    documentId: "document",
    version: 1,
    title: "Community agreement",
    contentText: "<script>not executable</script> Exact version one.",
    hasOriginalFile: false,
    createdAt: "2026-10-01",
  },
  recipientUserId: "person",
  recipientName: "Alex Adult",
  assignedAt: "2026-10-01",
  adultConfirmedAt: "2026-10-01",
  supersededAt: null,
  acceptance: null,
};
const nav = resolveAdminNavItems({
  role: {
    isOrgAdmin: false,
    isOrgOwner: false,
    isSiteAdmin: false,
    isStaff: false,
    isSafeguardingStaff: false,
    isSuperUser: false,
  },
  currentOrgIsMasterOrg: false,
  capabilities: ["compliance.agreements.read"],
  permissions: [],
  ui: resolveOrgUi("ACE_SCHOOL", "SCHOOL"),
});
assert.ok(
  nav.some((item) => item.href === "/compliance/agreements"),
  "ordinary assigned users have navigation",
);
async function run() {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const previous = globalThis.fetch;
  const signals: AbortSignal[] = [];
  const paths: string[] = [];
  const peopleQueries: string[] = [];
  let failPeoplePage = true;
  const writes: unknown[] = [];
  let fail = true;
  let conflict = true;
  let accepted: AgreementAssignment | null = null;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (init?.signal) signals.push(init.signal);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer agreements-test",
    );
    const response = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      if (conflict) return response({}, 409);
      return response({
        ...assignment,
        acceptance: {
          id: "acceptance",
          method: "ACKNOWLEDGED",
          typedName: "Alex Adult",
          recordedAt: "2026-10-15",
          recordedByUserId: "person",
          signedOn: null,
          hasSignedCopy: false,
        },
      });
    }
    if (path.endsWith("/people")) {
      const params = new URL(String(input)).searchParams;
      peopleQueries.push(params.get("query") ?? "");
      if (params.has("cursor") && failPeoplePage) {
        failPeoplePage = false;
        return response({}, 503);
      }
      return response({
        items: params.has("cursor")
          ? [
              {
                id: "adult",
                name: "Alex Adult",
                ageStatus: "NEEDS_CONFIRMATION",
              },
            ]
          : [],
        nextCursor:
          params.get("cursor") === "last"
            ? null
            : params.has("cursor")
              ? "last"
              : "more",
      });
    }
    if (fail) return response({}, 503);
    return response({
      items: path.endsWith("documents")
        ? [
            {
              id: "document",
              latestVersion: assignment.version,
              createdAt: "2026-10-01",
            },
          ]
        : [assignment],
      nextCursor: null,
    });
  };
  setApiTokenGetter(async () => "agreements-test");
  const settle = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  const click = async (text: string) => {
    const button = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === text,
    );
    assert.ok(button, text);
    await act(async () => button.click());
    await settle();
  };
  const input = async (selector: string, value: string) => {
    const element = host.querySelector<HTMLInputElement>(selector);
    assert.ok(element);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      )!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  try {
    await act(async () =>
      root.render(<AgreementsWorkspace canRead={false} canManage={false} />),
    );
    await settle();
    assert.match(host.textContent ?? "", /could not be loaded/);
    fail = false;
    await click("Retry my agreements");
    assert.match(host.textContent ?? "", /Community agreement/);
    assert.equal(host.querySelector("script"), null);
    assert.equal(
      paths.some((path) => path.endsWith("documents")),
      false,
    );
    const oldSignals = [...signals];
    await act(async () =>
      root.render(
        <AgreementsWorkspace key="new-context" canRead canManage={false} />,
      ),
    );
    await settle();
    assert.ok(oldSignals.every((signal) => signal.aborted));
    assert.match(host.textContent ?? "", /Document register/);
    assert.equal(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent === "Publish a document",
      ),
      false,
    );
    await act(async () =>
      root.render(
        <AssignmentCard
          key="own"
          value={assignment}
          own
          canManage={false}
          onChange={(value) => {
            accepted = value;
          }}
        />,
      ),
    );
    await input("input:not([type])", "Alex Adult");
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    await click("Record acknowledgement");
    assert.equal(accepted, null);
    assert.match(host.textContent ?? "", /failed|conflict|version|409/i);
    assert.equal(
      host.querySelector<HTMLInputElement>("input:not([type])")?.value,
      "Alex Adult",
    );
    conflict = false;
    await click("Record acknowledgement");
    assert.ok(accepted);
    assert.deepEqual(writes.at(-1), {
      versionId: "version",
      typedName: "Alex Adult",
      confirmed: true,
    });
    await act(async () =>
      root.render(
        <AssignmentCard
          key="history"
          value={{
            ...assignment,
            supersededAt: "2026-10-15",
            acceptance: accepted!.acceptance,
          }}
          own
          canManage
          onChange={() => {
            throw new Error("History cannot change");
          }}
        />,
      ),
    );
    assert.match(host.textContent ?? "", /Historical version/);
    assert.match(host.textContent ?? "", /Acknowledged in the portal/);
    assert.equal(host.querySelector("form"), null);
    await act(async () =>
      root.render(
        <PublishForm
          document={{
            id: "document",
            latestVersion: assignment.version,
            createdAt: "2026-10-01",
          }}
          onPublished={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    conflict = true;
    await click("Publish version");
    assert.match(host.textContent ?? "", /failed|conflict|version|409/i);
    assert.equal(
      (writes.at(-1) as { expectedVersion: number }).expectedVersion,
      1,
    );
    assert.equal(
      host.querySelector("textarea")?.value,
      assignment.version.contentText,
    );
    await act(async () =>
      root.render(<AssignForm versionId="version" onAssigned={() => {}} />),
    );
    await input("input", "Alex");
    await click("Search recipients");
    assert.match(host.textContent ?? "", /Load more to continue searching/);
    await input("input", "Different draft query");
    await click("Load more recipients");
    assert.ok(
      host.querySelector('[role="alert"]'),
      "failed page has feedback and remains retryable",
    );
    await click("Load more recipients");
    assert.match(host.textContent ?? "", /Alex Adult/);
    await click("Load more recipients");
    assert.equal(
      host.querySelectorAll('input[type="checkbox"]').length,
      2,
      "duplicate recipients are deduplicated",
    );
    assert.deepEqual(
      peopleQueries,
      ["Alex", "Alex", "Alex", "Alex"],
      "pagination uses submitted query, not current draft",
    );
    await click("Search recipients");
    assert.equal(
      host.querySelectorAll('input[type="checkbox"]').length,
      1,
      "new search resets earlier recipients",
    );
    assert.equal(peopleQueries.at(-1), "Different draft query");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    setApiTokenGetter(null);
    host.remove();
  }
  assert.ok(signals.every((signal) => signal.aborted));
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
