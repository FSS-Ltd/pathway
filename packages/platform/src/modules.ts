import type { Module } from "@prisma/client";
import { prisma } from "./db";

export async function orgHasModule(
  orgId: string,
  module: Module,
): Promise<boolean> {
  const row = await prisma.orgModule.findUnique({
    where: { orgId_module: { orgId, module } },
  });
  if (!row || row.status !== "ACTIVE") return false;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return false;
  return true;
}
