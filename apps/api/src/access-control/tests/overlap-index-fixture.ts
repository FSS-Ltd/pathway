import { randomUUID } from "node:crypto";
import { prisma } from "@pathway/db";

/**
 * The composite index is useful when identity is selective within a populated
 * site. Two isolated rows legitimately favour smaller indexes, depending on
 * fixtures and statistics left by earlier suites. Keep this planner fixture
 * private to a rolled-back transaction so it cannot affect other scenarios.
 */
export async function explainRepresentativeOverlapProbe(
  orgId: string,
  tenantId: string,
  assignedById: string,
): Promise<Array<Record<string, unknown>>> {
  const userIds = Array.from({ length: 32 }, () => randomUUID());
  const roleIds = Array.from({ length: 32 }, () => randomUUID());
  const rollback = new Error("Roll back overlap planner fixture");
  let plan: Array<Record<string, unknown>> | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.createMany({
        data: userIds.map((id) => ({
          id,
          email: `${id}@overlap-planner.test`,
        })),
      });
      await tx.orgMembership.createMany({
        data: userIds.map((userId) => ({ orgId, userId, role: "ORG_MEMBER" })),
      });
      await tx.orgRoleDefinition.createMany({
        data: roleIds.map((id) => ({
          id,
          orgId,
          tenantId,
          name: `Planner fixture ${id}`,
          scope: "site",
          isSystem: false,
          createdById: assignedById,
          updatedById: assignedById,
        })),
      });
      await tx.userRoleAssignment.createMany({
        data: userIds.flatMap((userId) =>
          roleIds.map((roleDefinitionId) => ({
            orgId,
            tenantId,
            userId,
            roleDefinitionId,
            assignedById,
            startsAt: new Date("2060-01-01T09:00:00.000Z"),
            expiresAt: new Date("2060-01-01T10:00:00.000Z"),
          })),
        ),
      });
      await tx.$executeRawUnsafe('ANALYZE app."UserRoleAssignment"');
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      plan = await tx.$queryRaw<Array<Record<string, unknown>>>`
        EXPLAIN (FORMAT JSON)
        SELECT 1 FROM app."UserRoleAssignment"
        WHERE "orgId" = ${orgId}
          AND "tenantId" = ${tenantId}::text
          AND "userId" = ${userIds[0]}
          AND "roleDefinitionId" = ${roleIds[0]}
          AND "revokedAt" IS NULL
          AND "startsAt" < ${new Date("2060-01-01T10:00:00.000Z")}::timestamp
          AND ${new Date("2060-01-01T09:00:00.000Z")}::timestamp < COALESCE("expiresAt", 'infinity'::timestamp)
        ORDER BY "orgId", "tenantId", "userId", "roleDefinitionId", "startsAt", "expiresAt"
        LIMIT 1`;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (!plan) throw new Error("Overlap planner fixture returned no plan");
  return plan;
}
