import type { UserRolesResponse } from "./api-client";

type AdminAccessLoadOptions = {
  loadRoles: () => Promise<UserRolesResponse>;
  loadCapabilities: () => Promise<string[]>;
  loadPermissions: () => Promise<string[]>;
  onRolesLoaded: (response: UserRolesResponse) => void;
  onCapabilitiesLoaded: (capabilities: string[]) => void;
  onPermissionsLoaded: (permissions: string[] | null) => void;
};

export async function loadAdminAccessIndependently({
  loadRoles,
  loadCapabilities,
  loadPermissions,
  onRolesLoaded,
  onCapabilitiesLoaded,
  onPermissionsLoaded,
}: AdminAccessLoadOptions): Promise<void> {
  const capabilities = Promise.resolve()
    .then(loadCapabilities)
    .catch(() => []);
  // null means "not loaded" (nav stays advisory) - distinct from "loaded, none".
  const permissions = Promise.resolve()
    .then(loadPermissions)
    .catch(() => null);

  const roles = await loadRoles();
  onRolesLoaded(roles);
  void capabilities.then(onCapabilitiesLoaded);
  void permissions.then(onPermissionsLoaded);
}
