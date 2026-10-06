import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  applyTenantContext,
  Prisma,
  runTransaction,
  type Prisma as PrismaTypes,
} from "@pathway/db";
import type { PaceInventoryBulkDto } from "./dto/pace-inventory-bulk.dto";
import type { PaceQueryActor } from "./pace-query.service";

export async function withAvailableInventoryPlacement<T>(
  actor: PaceQueryActor,
  command: PaceInventoryBulkDto,
  operation: (tx: PrismaTypes.TransactionClient) => Promise<T>,
): Promise<T> {
  if (
    !actor.tenantId?.trim() ||
    !actor.orgId?.trim() ||
    !actor.userId?.trim()
  ) {
    throw new BadRequestException("A complete active-site actor is required");
  }

  try {
    return await runTransaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
      );
      await applyTenantContext(tx, actor.tenantId, actor.orgId);

      const site = await tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { id: true },
      });
      if (!site) throw new NotFoundException("Active site not found");

      const enrollment = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT enrollment.id
        FROM "StudentSubjectEnrollment" AS enrollment
        JOIN "Child" AS child
          ON child.id = enrollment."childId"
          AND child."tenantId" = enrollment."tenantId"
        JOIN "Subject" AS subject
          ON subject.id = enrollment."subjectId"
          AND subject."tenantId" = enrollment."tenantId"
        WHERE enrollment."tenantId" = ${actor.tenantId}
          AND enrollment."childId" = ${command.childId}
          AND enrollment."subjectId" = ${command.subjectId}
          AND enrollment.status = 'ACTIVE'
          AND child."isGuest" = false
          AND subject."isActive" = true
        FOR UPDATE OF enrollment
      `;
      if (enrollment.length === 0) {
        throw new NotFoundException(
          "Active student subject placement not found",
        );
      }

      const supplied = await tx.paceInventorySupply.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          paceNumber: { in: command.paceNumbers },
        },
        select: { paceNumber: true },
      });
      if (supplied) {
        throw new ConflictException("A requested PACE is already supplied");
      }

      const pending = await tx.paceInventoryOrder.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          paceNumber: { in: command.paceNumbers },
          status: { in: ["ORDERED", "IN_TRANSIT"] },
        },
        select: { paceNumber: true },
      });
      if (pending) {
        throw new ConflictException("A requested PACE is already on order");
      }

      return operation(tx);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      throw new ConflictException("PACE inventory changed; refresh and retry");
    }
    throw error;
  }
}
