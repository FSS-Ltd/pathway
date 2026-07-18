import type { Vertical } from "@prisma/client";
import { prisma } from "./db";

export async function getOrgVertical(orgId: string): Promise<Vertical | null> {
  const row = await prisma.orgVertical.findUnique({ where: { orgId } });
  return row?.vertical ?? null;
}
