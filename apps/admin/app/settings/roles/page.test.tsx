import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AdminContextRuntime } from "@/lib/admin-context";
import { setApiTokenGetter } from "@/lib/api-transport";
import type { SessionContextValue } from "@/lib/use-session-compat";
import RolesAdminPage from "./page";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/settings/roles",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
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
let emptyPeople = false;
let pendingPeople: Promise<Response> | null = null;
let failBadgeOnce = true;
let badgeState: "inherit" | "enabled" | "excluded" = "inherit";
let badgeRevision = "";
let conflictOnNextBadge = false;
let roleAdded = false;
const directoryRequests: URL[] = [];
const accessRequests: string[] = [];
const badgeRequestIds: string[] = [];
const badgeExpectedRevisions: string[] = [];
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
  setApiTokenGetter(async () => "test");
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
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
      return response({ capabilities: ["platform.access.users.read"] });
    }
    if (path === "/access/users/me/permissions") {
      return response({
        permissions: [
          "platform.access.users.read",
          "platform.access.permissions.read",
          "platform.access.assignments.manage",
        ],
      });
    }
    if (path === "/orgs") {
      return response([{ id: "org-1", name: "One", vertical: "ACE_SCHOOL" }]);
    }
    if (path === "/access/tags/matrix") {
      return response({
        roles: [
          {
            id: "role-1",
            name: "Administrator",
            description: "Manage access",
            scope: "organisation",
            tenantId: null,
            permissionKeys: ["platform.access.users.read"],
          },
          {
            id: "role-2",
            name: "Office staff",
            description: "Manage office records",
            scope: "organisation",
            tenantId: null,
            permissionKeys: ["tenant.records.read"],
          },
        ],
        badges: [
          {
            key: "attendance-recorder",
            label: "Attendance recorder",
            description: "Mark attendance",
            available: true,
            permissionKeys: ["tenant.attendance.mark"],
            allowedScopes: ["site"],
            roleCoverage: [
              { roleId: "role-1", coverage: "full" },
              { roleId: "role-2", coverage: "none" },
            ],
          },
        ],
      });
    }
    if (path === "/access/users") {
      directoryRequests.push(url);
      assert.equal(init?.credentials, "include");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test",
      );
      if (pendingPeople) return pendingPeople;
      if (emptyPeople) return response({ items: [], nextCursor: null });
      return failPeople
        ? response({ detail: "private database trace" }, 503)
        : response({
            items: url.searchParams.has("cursor")
              ? [
                  {
                    id: "person-3",
                    name: "Morgan Lane",
                    displayName: null,
                    email: "morgan@example.com",
                    isActive: true,
                    superUser: false,
                    hasFamilyAccess: true,
                    orgRole: "ORG_MEMBER",
                    roleDefinitionIds: [],
                  },
                ]
              : [
                  {
                    id: "person-1",
                    name: "Alex Person",
                    displayName: null,
                    email: "alex@example.com",
                    isActive: true,
                    superUser: false,
                    hasFamilyAccess: false,
                    orgRole: "ORG_MEMBER",
                    roleDefinitionIds: ["role-1"],
                  },
                  {
                    id: "person-2",
                    name: "Alex Person",
                    displayName: null,
                    email: "other-alex@example.com",
                    isActive: true,
                    superUser: false,
                    hasFamilyAccess: true,
                    orgRole: "ORG_MEMBER",
                    roleDefinitionIds: [],
                  },
                ],
            nextCursor: url.searchParams.has("cursor") ? null : "person-2",
          });
    }
    if (/^\/access\/tags\/users\/person-[12]\/matrix$/.test(path)) {
      accessRequests.push(path);
      const duplicate = path.includes("person-2");
      return response({
        user: {
          id: duplicate ? "person-2" : "person-1",
          name: "Alex Person",
          displayName: null,
          email: duplicate ? "other-alex@example.com" : "alex@example.com",
          isActive: true,
          superUser: false,
        },
        roles: [
          {
            id: "role-1",
            name: "Administrator",
            description: "Manage access",
            scope: "organisation",
            tenantId: null,
            permissionKeys: ["tenant.attendance.mark"],
          },
          {
            id: "role-2",
            name: "Office staff",
            description: "Manage office records",
            scope: "organisation",
            tenantId: null,
            permissionKeys: ["tenant.records.read"],
          },
        ],
        badges: [
          {
            key: "attendance-recorder",
            label: "Attendance recorder",
            description: "Mark attendance",
            available: true,
            permissionKeys: ["tenant.attendance.mark"],
            allowedScopes: ["site"],
            roleCoverage: [{ roleId: "role-1", coverage: "full" }],
            editableScopes: ["site"],
            selected: badgeState !== "excluded",
            effectiveCoverage: badgeState === "excluded" ? "none" : "full",
            sourceRoleIds: ["role-1"],
            directGrants:
              badgeState === "enabled"
                ? [{ id: "grant-1", tenantId: "site-1", expiresAt: null }]
                : [],
            exclusions:
              badgeState === "excluded"
                ? [{ id: "exclusion-1", tenantId: "site-1" }]
                : [],
            blockingTags:
              badgeState === "excluded" ? ["attendance-recorder"] : [],
            revisions: {
              organisation: "",
              site: badgeRevision,
            },
            revision: badgeRevision,
          },
        ],
        assignments: [
          {
            id: "assignment-1",
            roleDefinitionId: "role-1",
            tenantId: null,
            startsAt: "2026-01-01T00:00:00Z",
            expiresAt: null,
          },
          ...(roleAdded
            ? [
                {
                  id: "assignment-2",
                  roleDefinitionId: "role-2",
                  tenantId: null,
                  startsAt: "2026-01-01T00:00:00Z",
                  expiresAt: null,
                },
              ]
            : []),
        ],
        effectivePermissions: [],
        superUserExempt: false,
        canAdministerBadges: true,
        targetInSelectedSite: true,
      });
    }
    if (
      path === "/access/tags/users/person-1/attendance-recorder" &&
      init?.method === "PUT"
    ) {
      badgeRequestIds.push(new Headers(init.headers).get("x-request-id") ?? "");
      const input = JSON.parse(String(init.body)) as {
        state: "enabled" | "excluded" | "inherit";
        expectedRevision: string;
      };
      badgeExpectedRevisions.push(input.expectedRevision);
      if (conflictOnNextBadge) {
        conflictOnNextBadge = false;
        badgeRevision = "external-1";
        return response(
          {
            code: "BADGE_STATE_CONFLICT",
            message: "Access changed. Retry with the current revision.",
          },
          409,
        );
      }
      if (failBadgeOnce) {
        failBadgeOnce = false;
        return response(
          { code: "TEMPORARY_FAILURE", message: "Please retry." },
          503,
        );
      }
      badgeState = input.state;
      badgeRevision =
        badgeState === "excluded"
          ? "e:exclusion-1"
          : badgeState === "enabled"
            ? "g:grant-1"
            : "";
      return response({
        state: input.state,
        revision: badgeRevision,
      });
    }
    if (path === "/access/assignments" && init?.method === "POST") {
      roleAdded = true;
      return response({ id: "assignment-2" });
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

    assert.match(container.textContent ?? "", /Unable to load people/);
    assert.match(container.textContent ?? "", /support-123/);
    const personPicker = () => {
      const control = container.querySelector<HTMLSelectElement>(
        'select[aria-label="Select a person"]',
      );
      assert.ok(
        control,
        "Roles and Access must offer database-backed person choices",
      );
      return control;
    };
    assert.equal(personPicker().disabled, true);
    assert.equal(personPicker().options.length, 1);

    failPeople = false;
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Retry",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    await settle();
    assert.doesNotMatch(container.textContent ?? "", /Unable to load people/);
    assert.match(container.textContent ?? "", /Alex Person/);
    assert.match(
      container.textContent ?? "",
      /Narrow by name or email \(optional\)/,
    );
    assert.deepEqual(
      Array.from(personPicker().options).map((option) => [
        option.value,
        option.text,
      ]),
      [
        ["", "Choose from this page"],
        ["person-1", "Alex Person · alex@example.com"],
        ["person-2", "Alex Person · other-alex@example.com"],
      ],
    );
    const change = async (control: HTMLSelectElement, value: string) => {
      await act(async () => {
        control.value = value;
        control.dispatchEvent(
          new dom.window.Event("change", { bubbles: true }),
        );
      });
      await settle();
    };
    const directoryCount = directoryRequests.length;
    await change(personPicker(), "person-2");
    assert.equal(accessRequests.at(-1), "/access/tags/users/person-2/matrix");
    assert.match(
      container.querySelector('[aria-labelledby="selected-person-title"]')
        ?.textContent ?? "",
      /other-alex@example.com/,
    );
    assert.equal(
      directoryRequests.length,
      directoryCount,
      "Selecting a record must not query by its name",
    );
    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Next",
    );
    assert.ok(next);
    await act(async () => next.click());
    await settle();
    assert.equal(
      directoryRequests.at(-1)?.searchParams.get("cursor"),
      "person-2",
    );
    assert.equal(personPicker().options[1]?.value, "person-3");
    assert.equal(personPicker().options.length, 2);
    assert.equal(
      personPicker().value,
      "",
      "A selection on another page must not masquerade as a current choice",
    );
    const roleFilter = container.querySelector<HTMLSelectElement>(
      "#access-role-filter",
    );
    assert.ok(roleFilter);
    await change(roleFilter, "role-1");
    assert.equal(
      directoryRequests.at(-1)?.searchParams.get("roleDefinitionId"),
      "role-1",
    );
    assert.equal(directoryRequests.at(-1)?.searchParams.has("cursor"), false);
    await change(personPicker(), "person-1");
    assert.equal(accessRequests.at(-1), "/access/tags/users/person-1/matrix");
    await settle();
    assert.match(container.textContent ?? "", /Selected person/);
    assert.match(container.textContent ?? "", /alex@example.com/);
    const badgesTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).find((button) => button.textContent?.trim() === "Badges");
    assert.ok(badgesTab);
    await act(async () => badgesTab.click());
    const badge = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Attendance recorder: included"]',
    );
    assert.ok(badge);
    assert.equal(badge.getAttribute("aria-pressed"), "true");
    const details = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Details about Attendance recorder"]',
    );
    assert.ok(details);
    await act(async () => details.click());
    assert.match(
      container.querySelector('[role="tooltip"]')?.textContent ?? "",
      /Mark attendance/,
    );
    assert.match(
      container.querySelector('[role="tooltip"]')?.textContent ?? "",
      /inherited/,
    );
    const exclude = badge;
    assert.ok(exclude);
    await act(async () => exclude.click());
    assert.match(container.textContent ?? "", /Exclude Attendance recorder/);
    const confirm = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Exclude badge",
    );
    assert.ok(confirm);
    await act(async () => confirm.click());
    await settle();
    assert.match(container.textContent ?? "", /Please retry/);
    const badgeRetry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Retry",
    );
    assert.ok(badgeRetry);
    await act(async () => badgeRetry.click());
    await settle();
    assert.match(container.textContent ?? "", /Saved/);
    assert.equal(badgeRequestIds.length, 2);
    assert.ok(badgeRequestIds[0]);
    assert.equal(badgeRequestIds[0], badgeRequestIds[1]);
    const excludedBadge = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Attendance recorder: no access"]',
    );
    assert.ok(excludedBadge);
    assert.equal(excludedBadge.getAttribute("aria-pressed"), "false");
    await act(async () => excludedBadge.click());
    await settle();
    assert.equal(badgeState, "enabled");
    assert.equal(
      container
        .querySelector('button[aria-label="Attendance recorder: included"]')
        ?.getAttribute("aria-pressed"),
      "true",
    );
    const defaults = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Use role defaults");
    assert.ok(defaults);
    await act(async () => defaults.click());
    await settle();
    assert.equal(
      container
        .querySelector('button[aria-label="Attendance recorder: included"]')
        ?.getAttribute("aria-pressed"),
      "true",
    );
    conflictOnNextBadge = true;
    const selectedBadge = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Attendance recorder: included"]',
    );
    assert.ok(selectedBadge);
    await act(async () => selectedBadge.click());
    const confirmAfterConflict = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Exclude badge");
    assert.ok(confirmAfterConflict);
    await act(async () => confirmAfterConflict.click());
    await settle();
    assert.match(container.textContent ?? "", /Access changed/);
    assert.doesNotMatch(container.textContent ?? "", /Saved/);
    const conflictRetry = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Retry");
    assert.ok(conflictRetry);
    await act(async () => conflictRetry.click());
    await settle();
    assert.equal(badgeState, "excluded");
    assert.notEqual(badgeRequestIds.at(-1), badgeRequestIds.at(-2));
    assert.equal(badgeExpectedRevisions.at(-1), "external-1");
    assert.match(container.textContent ?? "", /Selected person/);
    assert.equal(badgesTab.getAttribute("aria-selected"), "true");
    const rolesTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).find((button) => button.textContent?.trim() === "Roles");
    assert.ok(rolesTab);
    await act(async () => rolesTab.click());
    const roleSelect =
      container.querySelector<HTMLSelectElement>("#assign-fixed-role");
    assert.ok(roleSelect);
    await act(async () => {
      roleSelect.value = "role-2";
      roleSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    const addRole = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Add role",
    );
    assert.ok(addRole);
    await act(async () => addRole.click());
    await settle();
    assert.match(container.textContent ?? "", /Office staff/);
    assert.match(container.textContent ?? "", /Selected person/);
    assert.equal(rolesTab.getAttribute("aria-selected"), "true");
    const matrixTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).find((button) => button.textContent?.trim() === "Badge matrix");
    assert.ok(matrixTab);
    await act(async () => matrixTab.click());
    assert.match(container.textContent ?? "", /Attendance recorder/);
    const peopleTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).find((button) => button.textContent?.trim() === "People");
    assert.ok(peopleTab);
    await act(async () => peopleTab.click());
    assert.match(container.textContent ?? "", /Selected person/);
    assert.equal(
      container
        .querySelector("#person-tab-roles")
        ?.getAttribute("aria-selected"),
      "true",
    );
    assert.doesNotMatch(container.textContent ?? "", /Invite person/);

    const refresh = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Refresh",
    );
    assert.ok(refresh);
    let resolvePeople: (value: Response) => void = () =>
      assert.fail("Directory request must be pending");
    pendingPeople = new Promise((resolve) => {
      resolvePeople = resolve;
    });
    await act(async () => refresh.click());
    assert.equal(personPicker().disabled, true);
    assert.equal(
      personPicker().options.length,
      1,
      "Loading must hide old choices",
    );
    await act(async () =>
      resolvePeople(response({ detail: "private database trace" }, 503)),
    );
    await settle();
    pendingPeople = null;
    assert.equal(personPicker().disabled, true);
    assert.equal(
      personPicker().options.length,
      1,
      "A failed refresh must not leave old choices",
    );
    assert.doesNotMatch(container.textContent ?? "", /private database trace/);
    emptyPeople = true;
    await act(async () => refresh.click());
    await settle();
    assert.equal(personPicker().disabled, true);
    assert.equal(personPicker().options[0]?.text, "No records available");
    emptyPeople = false;
    await act(async () => refresh.click());
    await settle();
    assert.equal(personPicker().disabled, false);
  } finally {
    await act(async () => root.unmount());
    setApiTokenGetter(null);
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
