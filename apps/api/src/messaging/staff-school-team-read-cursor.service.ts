import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { ReadCursorInput } from "./dto/messaging-query.dto";
import { assertMessagingActor, type MessagingActor } from "./messaging-access";
import { advanceMessageReadCursor } from "./messaging-read-cursor";
import {
  requireStaffSchoolTeamAccess,
  staffSchoolTeamConversationScope,
} from "./staff-school-team-access";

@Injectable()
export class StaffSchoolTeamReadCursorService {
  async advance(
    actor: MessagingActor,
    conversationId: string,
    input: ReadCursorInput,
  ): Promise<{ lastReadSequence: number }> {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const now = new Date();
      await requireStaffSchoolTeamAccess(tx, actor, now);
      const conversation = await tx.messageConversation.findFirst({
        where: {
          ...staffSchoolTeamConversationScope(actor, now),
          id: conversationId,
        },
        select: {
          participants: {
            where: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
            select: { id: true },
            take: 1,
          },
        },
      });
      const participantId = conversation?.participants[0]?.id;
      if (!participantId) {
        throw new NotFoundException("Messages not found");
      }

      const message = await tx.message.findFirst({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          sequence: input.sequence,
        },
        select: { id: true },
      });
      if (!message) {
        throw new BadRequestException("Message sequence not found");
      }
      return advanceMessageReadCursor(
        tx,
        actor.tenantId,
        conversationId,
        participantId,
        input.sequence,
      );
    });
  }
}
