import type { Prisma } from "@prisma/client";
import type { Capability } from "./types";
import { prisma } from "./db";
import { getOrgVertical, type OrgVerticalReader } from "./vertical";
import { VERTICAL_CAPABILITIES, MODULE_CAPABILITIES } from "./capability-maps";

export interface OrgCapabilityReader extends OrgVerticalReader {
  orgModule: Pick<Prisma.TransactionClient["orgModule"], "findMany">;
}

export async function getOrgCapabilities(
  orgId: string,
  client: OrgCapabilityReader = prisma,
): Promise<Capability[]> {
  const now = Date.now();
  const vertical = await getOrgVertical(orgId, client);
  const modules = await client.orgModule.findMany({
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
