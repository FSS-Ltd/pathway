import { Module, ModuleStatus, type Prisma } from "@prisma/client";
import type { Capability } from "./types";
import { prisma } from "./db";
import { getOrgVertical, type OrgVerticalReader } from "./vertical";
import {
  FINANCE_SERVICING_CAPABILITIES,
  VERTICAL_CAPABILITIES,
  MODULE_CAPABILITIES,
} from "./capability-maps";

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
    where: {
      orgId,
      OR: [{ status: ModuleStatus.ACTIVE }, { module: Module.FINANCE }],
    },
  });

  const caps = new Set<Capability>();
  if (vertical) {
    for (const c of VERTICAL_CAPABILITIES[vertical]) caps.add(c);
  }
  // Learning is part of the platform for every organisation, regardless of
  // optional-module billing or an OrgModule grant.
  for (const c of MODULE_CAPABILITIES.LEARNING) caps.add(c);
  for (const m of modules) {
    const isCurrent =
      m.status === ModuleStatus.ACTIVE &&
      (!m.expiresAt || m.expiresAt.getTime() > now);
    if (!isCurrent) {
      if (m.module === Module.FINANCE) {
        for (const c of FINANCE_SERVICING_CAPABILITIES) caps.add(c);
      }
      continue;
    }
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
