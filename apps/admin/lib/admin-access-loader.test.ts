import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadAdminAccessIndependently } from "./admin-access-loader";
import type { UserRolesResponse } from "./api-client";

async function runTests() {
  const roles: UserRolesResponse = {
    userId: "user-1",
    orgRoles: [],
    siteRoles: [],
    orgMemberships: [],
    siteMemberships: [],
  };

  let resolveCapabilities: (capabilities: string[]) => void = () => undefined;
  const pendingCapabilities = new Promise<string[]>((resolve) => {
    resolveCapabilities = resolve;
  });
  let loadedRoles: UserRolesResponse | null = null;
  let loadedCapabilities: string[] | null = null;
  let loadedPermissions: string[] | null = null;

  await loadAdminAccessIndependently({
    loadRoles: async () => roles,
    loadCapabilities: () => pendingCapabilities,
    loadPermissions: async () => ["ace.pace.read"],
    onRolesLoaded: (response) => {
      loadedRoles = response;
    },
    onCapabilitiesLoaded: (capabilities) => {
      loadedCapabilities = capabilities;
    },
    onPermissionsLoaded: (permissions) => {
      loadedPermissions = permissions;
    },
  });

  assert.equal(loadedRoles, roles, "role loading completes independently");
  assert.equal(
    loadedCapabilities,
    null,
    "pending capabilities do not block role loading",
  );
  await setImmediate();
  assert.deepEqual(
    loadedPermissions,
    ["ace.pace.read"],
    "permissions load independently of the pending capabilities promise",
  );

  resolveCapabilities(["finance.invoices"]);
  await setImmediate();
  assert.deepEqual(loadedCapabilities, ["finance.invoices"]);

  loadedCapabilities = null;
  await loadAdminAccessIndependently({
    loadRoles: async () => roles,
    loadCapabilities: async () => {
      throw new Error("capability endpoint unavailable");
    },
    loadPermissions: async () => ["ace.pace.read"],
    onRolesLoaded: () => undefined,
    onCapabilitiesLoaded: (capabilities) => {
      loadedCapabilities = capabilities;
    },
    onPermissionsLoaded: () => undefined,
  });
  await setImmediate();
  assert.deepEqual(
    loadedCapabilities,
    [],
    "capability errors fail closed without failing role loading",
  );

  loadedPermissions = null;
  await loadAdminAccessIndependently({
    loadRoles: async () => roles,
    loadCapabilities: async () => [],
    loadPermissions: async () => {
      throw new Error("permissions endpoint unavailable");
    },
    onRolesLoaded: () => undefined,
    onCapabilitiesLoaded: () => undefined,
    onPermissionsLoaded: (permissions) => {
      loadedPermissions = permissions;
    },
  });
  await setImmediate();
  assert.equal(
    loadedPermissions,
    null,
    "permission errors leave nav advisory (null) rather than failing role loading",
  );

  console.log("admin access loader checks passed");
}

void runTests();
