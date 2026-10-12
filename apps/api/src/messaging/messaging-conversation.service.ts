import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import type { CreateStaffDirectConversationInput } from "./dto/messaging-command.dto";
import {
  assertMessagingActor,
  requireCurrentStaff,
  type MessagingActor,
} from "./messaging-access";

@Injectable()
export class MessagingConversationService {
  async openStaffDirect(
    actor: MessagingActor,
    input: CreateStaffDirectConversationInput,
  ) {
    assertMessagingActor(actor);
    if (actor.userId === input.recipientUserId) {
      throw new BadRequestException("Choose another staff member");
    }

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const participantIds = [actor.userId, input.recipientUserId].sort();
      const lockKey = `ace-staff-direct:${actor.tenantId}:${participantIds.join(":")}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );

      const [recipient, student] = await Promise.all([
        tx.siteMembership.findUnique({
          where: {
            tenantId_userId: {
              tenantId: actor.tenantId,
              userId: input.recipientUserId,
            },
            role: { in: ["SITE_ADMIN", "STAFF"] },
          },
          select: { id: true, user: { select: { isActive: true } } },
        }),
        tx.studentIdentity.findUnique({
          where: {
            tenantId_userId: {
              tenantId: actor.tenantId,
              userId: input.recipientUserId,
            },
          },
          select: { id: true },
        }),
      ]);
      if (!recipient?.user.isActive || student) {
        throw new NotFoundException("Staff recipient not found");
      }

      const existing = await tx.messageConversation.findFirst({
        where: {
          tenantId: actor.tenantId,
          kind: "STAFF_DIRECT",
          AND: [
            ...participantIds.map((userId) => ({
              participants: {
                some: { tenantId: actor.tenantId, userId, removedAt: null },
              },
            })),
            {
              participants: {
                none: {
                  removedAt: null,
                  userId: { notIn: participantIds },
                },
              },
            },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (existing) {
        return {
          id: existing.id,
          kind: "STAFF_DIRECT" as const,
          created: false,
        };
      }

      const created = await tx.messageConversation.create({
        data: {
          kind: "STAFF_DIRECT",
          tenant: { connect: { id: actor.tenantId } },
          createdBy: { connect: { id: actor.userId } },
          participants: {
            create: participantIds.map((userId) => ({
              kind: "STAFF",
              tenant: { connect: { id: actor.tenantId } },
              user: { connect: { id: userId } },
            })),
          },
        },
        select: { id: true },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_MESSAGE,
        entityId: created.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "STAFF_DIRECT",
          recipientUserId: input.recipientUserId,
        },
      });
      return { id: created.id, kind: "STAFF_DIRECT" as const, created: true };
    });
  }
}
