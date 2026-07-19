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

  await loadAdminAccessIndependently({
    loadRoles: async () => roles,
    loadCapabilities: () => pendingCapabilities,
    onRolesLoaded: (response) => {
      loadedRoles = response;
    },
    onCapabilitiesLoaded: (capabilities) => {
      loadedCapabilities = capabilities;
    },
  });

  assert.equal(loadedRoles, roles, "role loading completes independently");
  assert.equal(
    loadedCapabilities,
    null,
    "pending capabilities do not block role loading",
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
    onRolesLoaded: () => undefined,
    onCapabilitiesLoaded: (capabilities) => {
      loadedCapabilities = capabilities;
    },
  });
  await setImmediate();
  assert.deepEqual(
    loadedCapabilities,
    [],
    "capability errors fail closed without failing role loading",
  );

  console.log("admin access loader checks passed");
}

void runTests();
