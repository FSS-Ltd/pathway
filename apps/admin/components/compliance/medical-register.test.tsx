import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type {
  ComplianceMedicalRecord,
  ComplianceMedicalUpdate,
} from "@pathway/types";
import { setApiTokenGetter } from "@/lib/api-transport";
import { MedicalRegister } from "./medical-register";
import { MedicalEditor } from "./medical-editor";
import { resolveAdminNavItems } from "@/app/admin-navigation";
import { resolveOrgUi } from "@/lib/org-ui";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/compliance/medical",
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
const record: ComplianceMedicalRecord = {
  id: "child-one",
  firstName: "Alex",
  lastName: "Student",
  preferredName: null,
  yearGroup: "4",
  allergies: { status: "UNKNOWN", details: null },
  medicalConditions: { status: "NONE", details: null },
  medicationAtSite: {
    status: "RECORDED",
    details: "Original medication instructions",
  },
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const latest = {
  ...record,
  updatedAt: "2026-10-02T00:00:00.000Z",
  medicationAtSite: {
    status: "RECORDED" as const,
    details: "Updated instructions",
  },
};
const nav = (capabilities: string[], permissions: string[]) =>
  resolveAdminNavItems({
    role: {
      isOrgAdmin: false,
      isOrgOwner: false,
      isSiteAdmin: false,
      isStaff: true,
      isSafeguardingStaff: false,
      isSuperUser: false,
    },
    currentOrgIsMasterOrg: false,
    capabilities,
    permissions,
    ui: resolveOrgUi("ACE_SCHOOL", "SCHOOL"),
  });
assert.equal(
  nav([], ["compliance.medical.read"]).some(
    (item) => item.href === "/compliance/medical",
  ),
  false,
);
assert.equal(
  nav(["compliance.medical.read"], []).some(
    (item) => item.href === "/compliance/medical",
  ),
  false,
);
assert.equal(
  nav(["compliance.medical.read"], ["compliance.medical.read"]).find(
    (item) => item.href === "/compliance/medical",
  )?.group,
  "Compliance",
);
async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let failList = true;
  let conflict = true;
  let detailReads = 0;
  let empty = false;
  const signals: AbortSignal[] = [];
  const writes: ComplianceMedicalUpdate[] = [];
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  globalThis.fetch = async (input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer medical-test",
    );
    if (init?.signal) signals.push(init.signal);
    const url = new URL(String(input));
    if (init?.method === "PATCH") {
      const body: ComplianceMedicalUpdate = JSON.parse(String(init.body));
      writes.push(body);
      return conflict
        ? response({}, 409)
        : response({
            ...record,
            ...body,
            updatedAt: "2026-10-03T00:00:00.000Z",
          });
    }
    if (url.pathname.endsWith("child-one"))
      return response(detailReads++ ? latest : record);
    if (failList) return response({}, 503);
    return response({
      items: empty
        ? []
        : [
            {
              ...record,
              id: url.searchParams.has("cursor") ? "child-two" : "child-one",
            },
          ],
      nextCursor:
        !empty && !url.searchParams.has("cursor") ? "second-page" : null,
    });
  };
  setApiTokenGetter(async () => "medical-test");
  const settle = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );
    assert.ok(button, label);
    await act(async () => button.click());
    await settle();
  };
  try {
    await act(async () => root.render(<MedicalRegister canManage={false} />));
    await settle();
    assert.match(container.textContent ?? "", /could not be loaded/);
    failList = false;
    await click("Retry medical information");
    assert.match(container.textContent ?? "", /Unknown \/ not confirmed/);
    assert.match(container.textContent ?? "", /None confirmed/);
    assert.match(
      container.textContent ?? "",
      /Original medication instructions/,
    );
    assert.equal(container.querySelector("a"), null);
    await click("Load more children");
    assert.equal(container.querySelectorAll("li").length, 2);
    await act(async () =>
      root.render(<MedicalRegister key="manage" canManage />),
    );
    await settle();
    assert.equal(
      container.querySelector("a")?.getAttribute("href"),
      "/children/child-one/edit?section=medical",
    );
    empty = true;
    await act(async () =>
      root.render(<MedicalRegister key="empty" canManage />),
    );
    await settle();
    assert.match(container.textContent ?? "", /No children/);
    await act(async () =>
      root.render(<MedicalEditor childId="child-one" canManage />),
    );
    await settle();
    await click("Save medical information");
    assert.equal(writes[0].expectedUpdatedAt, record.updatedAt);
    assert.match(container.textContent ?? "", /draft is preserved/);
    await click("Load latest information");
    assert.match(container.textContent ?? "", /Updated instructions/);
    assert.equal(
      container.querySelector("textarea")?.value,
      "Original medication instructions",
    );
    await click("Keep draft against latest version");
    conflict = false;
    await click("Save medical information");
    assert.equal(writes[1].expectedUpdatedAt, latest.updatedAt);
    assert.deepEqual(writes[1].medicationAtSite, record.medicationAtSite);
    assert.match(container.textContent ?? "", /Medical information saved/);
    await act(async () =>
      root.render(
        <MedicalEditor key="readonly" childId="child-one" canManage={false} />,
      ),
    );
    await settle();
    assert.equal(container.querySelector("form"), null);
    await act(async () => root.unmount());
    assert.ok(
      signals.every((signal) => signal.aborted),
      "All requests cancelled on leaving site/component",
    );
  } finally {
    globalThis.fetch = originalFetch;
    setApiTokenGetter(null);
    container.remove();
    dom.window.close();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
