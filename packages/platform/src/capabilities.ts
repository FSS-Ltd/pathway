import type { Capability } from "./types";

export async function getOrgCapabilities(orgId: string): Promise<Capability[]> {
  throw new Error(`not implemented: getOrgCapabilities(${orgId})`);
}

export async function orgHasCapability(
  orgId: string,
  capability: Capability,
): Promise<boolean> {
  throw new Error(
    `not implemented: orgHasCapability(${orgId}, ${capability})`,
  );
}
