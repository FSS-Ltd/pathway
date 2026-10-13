import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type {
  CompliancePeoplePage,
  ComplianceRecordPage,
} from "@pathway/types";
import type {
  ComplianceActor,
  ComplianceListQuery,
} from "./compliance.service";
import { serializeComplianceRecord } from "./compliance-record";

const PAGE_SIZE = 50;
const scope = (actor: ComplianceActor) => ({
  tenantId: actor.tenantId,
  orgId: actor.orgId,
});
export const complianceSiteUsers = (
  tenantId: string,
): Prisma.UserWhereInput => ({
  OR: [
    { tenantId },
    { siteMemberships: { some: { tenantId } } },
    { roles: { some: { tenantId } } },
  ],
});

export async function listComplianceRecords(
  tx: Prisma.TransactionClient,
  query: ComplianceListQuery,
  actor: ComplianceActor,
): Promise<ComplianceRecordPage> {
  const where: Prisma.CompliancePersonnelRecordWhereInput = {
    ...scope(actor),
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.kind ? { kind: query.kind } : {}),
  };
  if (query.cursor) {
    const cursor = await tx.compliancePersonnelRecord.findFirst({
      where: { ...where, id: query.cursor },
      select: { id: true },
    });
    if (!cursor)
      throw new NotFoundException("Register page is no longer available");
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const active = { ...scope(actor), archivedAt: null };
  const [rows, total, overdueReview, awaitingVerification] = await Promise.all([
    tx.compliancePersonnelRecord.findMany({
      where,
      orderBy: { id: "asc" },
      take: PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }),
    tx.compliancePersonnelRecord.count({ where: active }),
    tx.compliancePersonnelRecord.count({
      where: { ...active, reviewDueOn: { lt: today } },
    }),
    tx.compliancePersonnelRecord.count({
      where: { ...active, status: { not: "VERIFIED" } },
    }),
  ]);
  const items = rows.slice(0, PAGE_SIZE).map(serializeComplianceRecord);
  return {
    items,
    nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1]!.id : null,
    summary: { active: total, overdueReview, awaitingVerification },
  };
}

export async function findCompliancePeople(
  tx: Prisma.TransactionClient,
  query: string | undefined,
  actor: ComplianceActor,
): Promise<CompliancePeoplePage> {
  const search = query?.trim();
  const users = await tx.user.findMany({
    where: {
      AND: [
        complianceSiteUsers(actor.tenantId),
        { isActive: true },
        ...(search
          ? [
              {
                OR: ["name", "displayName", "firstName", "lastName"].map(
                  (field) => ({
                    [field]: { contains: search, mode: "insensitive" },
                  }),
                ),
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      displayName: true,
      firstName: true,
      lastName: true,
    },
    orderBy: { id: "asc" },
    take: 20,
  });
  return {
    items: users.map((user) => ({
      id: user.id,
      name:
        user.displayName ||
        user.name ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        "Unnamed portal user",
    })),
  };
}
