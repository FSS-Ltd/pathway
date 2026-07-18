import type { UserRolesResponse } from "./api-client";

type AdminAccessLoadOptions = {
  loadRoles: () => Promise<UserRolesResponse>;
  loadCapabilities: () => Promise<string[]>;
  onRolesLoaded: (response: UserRolesResponse) => void;
  onCapabilitiesLoaded: (capabilities: string[]) => void;
};

export async function loadAdminAccessIndependently({
  loadRoles,
  loadCapabilities,
  onRolesLoaded,
  onCapabilitiesLoaded,
}: AdminAccessLoadOptions): Promise<void> {
  const capabilities = Promise.resolve()
    .then(loadCapabilities)
    .catch(() => []);

  const roles = await loadRoles();
  onRolesLoaded(roles);
  void capabilities.then(onCapabilitiesLoaded);
}
