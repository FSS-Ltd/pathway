import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { SendMessageInput } from "./dto/messaging-command.dto";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "./parent-messaging-access";
import { parentResponderWhere } from "./parent-message-responder";

const SEND_PERMISSION = "messaging.messages.send" satisfies PermissionKey;

@Injectable()
export class ParentMessagingCommandService {
  async send(
    siteId: string,
    userId: string,
    conversationId: string,
    input: SendMessageInput,
  ) {
    return withParentMessagingAccess(
      siteId,
      userId,
      SEND_PERMISSION,
      async (tx, guardianId, orgId) => {
        const lockKey = `ace-parent-message-send:${siteId}:${conversationId}:${userId}:${input.clientRequestId}`;
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
        );

        const conversation = await tx.messageConversation.findFirst({
          where: {
            ...parentConversationScope(siteId, userId, guardianId),
            id: conversationId,
          },
          select: {
            participants: {
              where: { tenantId: siteId, removedAt: null },
              select: { id: true, userId: true, kind: true },
            },
          },
        });
        const sender = conversation?.participants.find(
          (participant) =>
            participant.kind === "GUARDIAN" && participant.userId === userId,
        );
        if (!conversation || !sender) {
          throw new NotFoundException("Messages not found");
        }

        const existing = await tx.message.findFirst({
          where: {
            tenantId: siteId,
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

        const staff = conversation.participants.filter(
          (participant) => participant.kind === "STAFF",
        );
        const eligible = await tx.siteMembership.findMany({
          where: {
            ...parentResponderWhere(orgId, siteId, new Date()),
            userId: { in: staff.map((participant) => participant.userId) },
          },
          select: { userId: true },
        });
        const eligibleUserIds = new Set(eligible.map((row) => row.userId));
        const recipients = staff.filter((participant) =>
          eligibleUserIds.has(participant.userId),
        );
        if (!recipients.length) {
          throw new NotFoundException("School responder not found");
        }

        const message = await tx.message.create({
          data: {
            clientRequestId: input.clientRequestId,
            bodyEncrypted: input.body,
            tenant: { connect: { id: siteId } },
            conversation: { connect: { id: conversationId } },
            sender: { connect: { id: sender.id } },
            deliveries: {
              create: recipients.map((recipient) => ({
                tenant: { connect: { id: siteId } },
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
          WHERE "id" = ${conversationId} AND "tenantId" = ${siteId}
        `);
        if (updated !== 1) throw new NotFoundException("Messages not found");
        await recordAuditEventInTransaction(tx, {
          actorUserId: userId,
          tenantId: siteId,
          orgId,
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
      },
    );
  }
}
