import type { Vertical } from "@prisma/client";

export async function getOrgVertical(orgId: string): Promise<Vertical | null> {
  throw new Error(`not implemented: getOrgVertical(${orgId})`);
}
