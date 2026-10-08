import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";
import type { ReadCursorInput } from "./dto/messaging-query.dto";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "./parent-messaging-access";
import { advanceMessageReadCursor } from "./messaging-read-cursor";

const READ_PERMISSION = "messaging.messages.read" satisfies PermissionKey;

@Injectable()
export class ParentMessagingReadCursorService {
  async advance(
    siteId: string,
    userId: string,
    conversationId: string,
    input: ReadCursorInput,
  ): Promise<{ lastReadSequence: number }> {
    return withParentMessagingAccess(
      siteId,
      userId,
      READ_PERMISSION,
      async (tx, guardianId) => {
        const conversation = await tx.messageConversation.findFirst({
          where: {
            ...parentConversationScope(siteId, userId, guardianId),
            id: conversationId,
          },
          select: {
            participants: {
              where: {
                tenantId: siteId,
                userId,
                kind: "GUARDIAN",
                guardianIdentityId: guardianId,
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
          where: { tenantId: siteId, conversationId, sequence: input.sequence },
          select: { id: true },
        });
        if (!message) {
          throw new BadRequestException("Message sequence not found");
        }
        return advanceMessageReadCursor(
          tx,
          siteId,
          conversationId,
          participantId,
          input.sequence,
        );
      },
    );
  }
}
