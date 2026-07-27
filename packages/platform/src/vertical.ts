import type { Prisma, Vertical } from "@prisma/client";
import { prisma } from "./db";

export interface OrgVerticalReader {
  orgVertical: Pick<Prisma.TransactionClient["orgVertical"], "findUnique">;
}

export async function getOrgVertical(
  orgId: string,
  client: OrgVerticalReader = prisma,
): Promise<Vertical | null> {
  const row = await client.orgVertical.findUnique({ where: { orgId } });
  return row?.vertical ?? null;
}
