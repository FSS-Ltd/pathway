import type { Capability } from "./types";
import { prisma } from "./db";
import { getOrgVertical } from "./vertical";
import { VERTICAL_CAPABILITIES, MODULE_CAPABILITIES } from "./capability-maps";

export async function getOrgCapabilities(orgId: string): Promise<Capability[]> {
  const now = Date.now();
  const vertical = await getOrgVertical(orgId);
  const modules = await prisma.orgModule.findMany({
    where: { orgId, status: "ACTIVE" },
  });

  const caps = new Set<Capability>();
  if (vertical) {
    for (const c of VERTICAL_CAPABILITIES[vertical]) caps.add(c);
  }
  for (const m of modules) {
    if (m.expiresAt && m.expiresAt.getTime() <= now) continue;
    for (const c of MODULE_CAPABILITIES[m.module]) caps.add(c);
  }
  return [...caps];
}

export async function orgHasCapability(
  orgId: string,
  capability: Capability,
): Promise<boolean> {
  const caps = await getOrgCapabilities(orgId);
  return caps.includes(capability);
}
