import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { SendMessageInput } from "./dto/messaging-command.dto";
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
      const lockKey = `ace-staff-school-team-send:${actor.tenantId}:${conversationId}:${actor.userId}:${input.clientRequestId}`;
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
