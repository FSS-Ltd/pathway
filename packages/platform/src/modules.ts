import type { Module } from "@prisma/client";

export async function orgHasModule(
  orgId: string,
  module: Module,
): Promise<boolean> {
  throw new Error(`not implemented: orgHasModule(${orgId}, ${module})`);
}
