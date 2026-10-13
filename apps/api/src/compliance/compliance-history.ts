import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { ComplianceRevisionPage } from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { parseComplianceSnapshot } from "./compliance-record";

export async function readComplianceHistory(
  tx: Prisma.TransactionClient,
  id: string,
  cursor: string | undefined,
  actor: ComplianceActor,
): Promise<ComplianceRevisionPage> {
  const PAGE_SIZE = 50;
  const where = { tenantId: actor.tenantId, orgId: actor.orgId, recordId: id };
  if (
    cursor &&
    !(await tx.compliancePersonnelRevision.findFirst({
      where: { ...where, id: cursor },
      select: { id: true },
    }))
  )
    throw new NotFoundException("History page is no longer available");
  const rows = await tx.compliancePersonnelRevision.findMany({
    where,
    orderBy: { version: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    version: row.version,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
    snapshot: parseComplianceSnapshot(row.snapshot),
  }));
  return {
    items,
    nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1]!.id : null,
  };
}
