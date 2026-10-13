import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { CompliancePersonnelRecord } from "@pathway/types";
import { setApiTokenGetter } from "@/lib/api-transport";
import { RecordHistory } from "./record-history";
import { ChecksRegister } from "./checks-register";
import { resolveAdminNavItems } from "@/app/admin-navigation";
import { resolveOrgUi } from "@/lib/org-ui";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/compliance/checks",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const record: CompliancePersonnelRecord = {
  id: "record-one",
  version: 1,
  subjectName: "Alex Staff",
  subjectUserId: null,
  roleDescription: "Volunteer tutor",
  kind: "BACKGROUND_CHECK",
  scheme: "DBS",
  title: "Role check",
  provider: null,
  reference: null,
  completedOn: "2026-09-01",
  reviewDueOn: null,
  status: "RECORDED",
  notes: "Original draft",
  verificationNotes: null,
  verifiedAt: null,
  verifiedByUserId: null,
  archivedAt: null,
  createdAt: "2026-09-01T12:00:00Z",
  updatedAt: "2026-09-01T12:00:00Z",
};
const role = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: true,
  isSafeguardingStaff: false,
  isSuperUser: false,
};
const nav = (capabilities: string[], permissions: string[]) =>
  resolveAdminNavItems({
    role,
    currentOrgIsMasterOrg: false,
    capabilities,
    permissions,
    ui: resolveOrgUi("ACE_SCHOOL", "SCHOOL"),
  });
assert.equal(
  nav([], ["compliance.checks.read"]).some(
    (item) => item.href === "/compliance/checks",
  ),
  false,
  "Home/no capability cannot expose register",
);
assert.equal(
  nav(["compliance.checks.read"], []).some(
    (item) => item.href === "/compliance/checks",
  ),
  false,
);
assert.equal(
  nav(["compliance.checks.read"], ["compliance.checks.read"]).find(
    (item) => item.href === "/compliance/checks",
  )?.group,
  "Compliance",
);
assert.equal(
  nav([], []).find((item) => item.href === "/safeguarding/concerns/new")?.group,
  "Compliance",
);
assert.equal(
  nav([], []).some((item) => item.href === "/safeguarding"),
  false,
  "ordinary staff do not gain safeguarding dashboard access",
);
async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const readSignals: AbortSignal[] = [];
  let failList = true;
  let empty = false;
  let conflict = true;
  let archived = false;
  let holdHistory = false;
  let releaseHistory: (() => void) | undefined;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if ((!init?.method || init.method === "GET") && init?.signal)
      readSignals.push(init.signal);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer compliance-test",
    );
    if (init?.method === "PATCH" || init?.method === "POST") {
      writes.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
      if (conflict) return response({}, 409);
      archived = url.pathname.endsWith("/archive");
      return response({
        ...record,
        version: 3,
        archivedAt: archived ? "2026-10-14T00:00:00Z" : null,
      });
    }
    if (url.pathname.endsWith("/history")) {
      if (holdHistory)
        await new Promise<void>((resolve) => {
          releaseHistory = resolve;
        });
      return response({
        items: [
          {
            id: "revision-one",
            version: 1,
            actorUserId: "reviewer-one",
            createdAt: record.createdAt,
            snapshot: record,
          },
        ],
        nextCursor: null,
      });
    }
    if (url.pathname.endsWith("/record-one"))
      return response({ ...record, version: 2, notes: "Changed elsewhere" });
    if (failList) return response({}, 503);
    return response({
      items: empty ? [] : [record],
      nextCursor: null,
      summary: { active: 1, overdueReview: 0, awaitingVerification: 1 },
    });
  };
  setApiTokenGetter(async () => "compliance-test");
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );
    assert.ok(button, label);
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  try {
    await act(async () => root.render(<ChecksRegister canManage />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.match(container.textContent ?? "", /could not be loaded/);
    failList = false;
    await click("Retry register");
    assert.match(container.textContent ?? "", /Alex Staff/);
    const row = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("View details"),
    );
    assert.ok(row);
    await act(async () => row.click());
    assert.equal(document.activeElement?.id, "record-editor-heading");
    const form = container.querySelector("form");
    assert.ok(form);
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.equal(writes[0].body.expectedVersion, 1);
    assert.match(container.textContent ?? "", /Your draft is preserved/);
    await click("Load latest version");
    const notes = container.querySelector<HTMLTextAreaElement>("form textarea");
    assert.equal(notes?.value, "Original draft");
    await click("Keep draft against latest version");
    conflict = false;
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(writes[1].body.expectedVersion, 2);
    await click("Load history");
    assert.match(container.textContent ?? "", /reviewer-one/);
    await click("Archive record");
    assert.equal(writes.length, 2, "archive requires confirmation");
    await click("Confirm archive");
    assert.equal(archived, true);
    assert.match(container.textContent ?? "", /Archived · history retained/);
    await click("Close");
    holdHistory = true;
    await act(async () =>
      root.render(<RecordHistory id={record.id} version={1} />),
    );
    await click("Load history");
    assert.match(container.textContent ?? "", /Loading history/);
    await act(async () =>
      root.render(<RecordHistory id={record.id} version={2} />),
    );
    const reloadHistory = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "Load history",
    );
    assert.ok(
      reloadHistory && !reloadHistory.disabled,
      "saving while history is pending must allow loading the new version",
    );
    await act(async () => releaseHistory?.());
    holdHistory = false;
    await click("Load history");
    assert.match(container.textContent ?? "", /reviewer-one/);

    await act(async () =>
      root.render(<ChecksRegister key="read-only" canManage={false} />),
    );
    assert.equal(
      [...container.querySelectorAll("button")].some(
        (item) => item.textContent === "Add record",
      ),
      false,
    );
    empty = true;
    await act(async () =>
      root.render(<ChecksRegister key="empty" canManage={false} />),
    );
    assert.match(
      container.textContent ?? "",
      /does not mean there are no applicable obligations/,
    );
    assert.ok(
      readSignals.some((signal) => signal.aborted),
      "changing scoped register unmounts abort outstanding reads",
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiTokenGetter(null);
    dom.window.close();
  }
  console.log("Compliance register runtime and navigation tests passed");
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
