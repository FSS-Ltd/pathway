import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { SendMessageInput } from "./dto/messaging-command.dto";
import {
  assertMessagingActor,
  requireCurrentStaff,
  STAFF_CONVERSATION_KINDS,
  type MessagingActor,
} from "./messaging-access";

@Injectable()
export class MessagingCommandService {
  async sendStaffMessage(
    actor: MessagingActor,
    conversationId: string,
    input: SendMessageInput,
  ) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const lockKey = `ace-message-send:${actor.tenantId}:${conversationId}:${actor.userId}:${input.clientRequestId}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );

      const conversation = await tx.messageConversation.findFirst({
        where: {
          id: conversationId,
          tenantId: actor.tenantId,
          kind: { in: [...STAFF_CONVERSATION_KINDS] },
          participants: {
            some: {
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
        },
        select: {
          id: true,
          participants: {
            where: { removedAt: null },
            select: {
              id: true,
              userId: true,
              kind: true,
              user: { select: { isActive: true } },
            },
          },
        },
      });
      const sender = conversation?.participants.find(
        (participant) => participant.userId === actor.userId,
      );
      if (!conversation || !sender) {
        throw new NotFoundException("Conversation not found");
      }

      const existing = await tx.message.findFirst({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          senderParticipantId: sender.id,
          clientRequestId: input.clientRequestId,
        },
        select: {
          id: true,
          sequence: true,
          bodyEncrypted: true,
          createdAt: true,
        },
      });
      if (existing) {
        if (existing.bodyEncrypted !== input.body) {
          throw new ConflictException("Client request ID already used");
        }
        return {
          id: existing.id,
          conversationId,
          clientRequestId: input.clientRequestId,
          sequence: existing.sequence,
          body: existing.bodyEncrypted,
          createdAt: existing.createdAt.toISOString(),
          reused: true,
        };
      }

      const participants = conversation.participants;
      const recipients = participants.filter(
        (participant) => participant.id !== sender.id,
      );
      const userIds = participants.map((participant) => participant.userId);
      const [memberships, students] = await Promise.all([
        tx.siteMembership.findMany({
          where: {
            tenantId: actor.tenantId,
            userId: { in: userIds },
            role: { in: ["SITE_ADMIN", "STAFF"] },
          },
          select: { userId: true },
        }),
        tx.studentIdentity.findMany({
          where: { tenantId: actor.tenantId, userId: { in: userIds } },
          select: { userId: true },
        }),
      ]);
      if (
        recipients.length === 0 ||
        participants.some(
          (participant) =>
            participant.kind !== "STAFF" || !participant.user.isActive,
        ) ||
        memberships.length !== participants.length ||
        students.length > 0
      ) {
        throw new NotFoundException("Conversation not found");
      }

      const message = await tx.message.create({
        data: {
          clientRequestId: input.clientRequestId,
          bodyEncrypted: input.body,
          tenant: { connect: { id: actor.tenantId } },
          conversation: { connect: { id: conversationId } },
          sender: { connect: { id: sender.id } },
          deliveries: {
            create: recipients.map((recipient) => ({
              tenant: { connect: { id: actor.tenantId } },
              recipientParticipant: { connect: { id: recipient.id } },
            })),
          },
        },
        select: {
          id: true,
          sequence: true,
          bodyEncrypted: true,
          createdAt: true,
        },
      });
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "MessageConversation"
        SET "updatedAt" = GREATEST("updatedAt", clock_timestamp())
        WHERE "id" = ${conversationId} AND "tenantId" = ${actor.tenantId}
      `);
      if (updated !== 1) {
        throw new NotFoundException("Conversation not found");
      }
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_MESSAGE,
        entityId: message.id,
        action: AuditAction.CREATED,
        metadata: { conversationId, sequence: message.sequence },
      });
      return {
        id: message.id,
        conversationId,
        clientRequestId: input.clientRequestId,
        sequence: message.sequence,
        body: message.bodyEncrypted,
        createdAt: message.createdAt.toISOString(),
        reused: false,
      };
    });
  }
}
