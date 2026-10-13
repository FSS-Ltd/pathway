import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { SendMessageInput } from "./dto/messaging-command.dto";
import {
  findMessageRetry,
  messageSendIdempotencyKey,
  recordMessageSent,
} from "./message-send-outbox";
import { assertMessagingActor, type MessagingActor } from "./messaging-access";
import {
  requireStaffSchoolTeamAccess,
  staffSchoolTeamConversationScope,
} from "./staff-school-team-access";

@Injectable()
export class StaffSchoolTeamCommandService {
  async send(
    actor: MessagingActor,
    conversationId: string,
    input: SendMessageInput,
  ) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const now = new Date();
      await requireStaffSchoolTeamAccess(tx, actor, now);
      const lockKey = messageSendIdempotencyKey(
        actor.tenantId,
        actor.userId,
        input.clientRequestId,
      );
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );

      const conversation = await tx.messageConversation.findFirst({
        where: {
          ...staffSchoolTeamConversationScope(actor, now),
          id: conversationId,
        },
        select: {
          guardianIdentityId: true,
          guardianIdentity: { select: { userId: true } },
          participants: {
            where: { tenantId: actor.tenantId, removedAt: null },
            select: {
              id: true,
              userId: true,
              kind: true,
              guardianIdentityId: true,
            },
          },
        },
      });
      const sender = conversation?.participants.find(
        (participant) =>
          participant.kind === "STAFF" && participant.userId === actor.userId,
      );
      const guardian = conversation?.participants.find(
        (participant) =>
          participant.kind === "GUARDIAN" &&
          participant.userId === conversation.guardianIdentity?.userId &&
          participant.guardianIdentityId === conversation.guardianIdentityId,
      );
      if (!sender || !guardian) {
        throw new NotFoundException("Messages not found");
      }

      const scope = {
        ...actor,
        conversationId,
        senderParticipantId: sender.id,
      };
      const retry = await findMessageRetry(tx, scope, input);
      if (retry) return retry;

      const message = await tx.message.create({
        data: {
          clientRequestId: input.clientRequestId,
          bodyEncrypted: input.body,
          tenant: { connect: { id: actor.tenantId } },
          conversation: { connect: { id: conversationId } },
          sender: { connect: { id: sender.id } },
          deliveries: {
            create: [
              {
                tenant: { connect: { id: actor.tenantId } },
                recipientParticipant: { connect: { id: guardian.id } },
              },
            ],
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
        throw new NotFoundException("Messages not found");
      }
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_MESSAGE,
        entityId: message.id,
        action: AuditAction.CREATED,
        metadata: {
          conversationId,
          sequence: message.sequence,
          recipientCount: 1,
        },
      });
      await recordMessageSent(tx, scope, input.clientRequestId, message.id);
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
