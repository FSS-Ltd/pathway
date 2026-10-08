import { Injectable, NotFoundException } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";

const READ_PERMISSION = "messaging.conversations.read" satisfies PermissionKey;

interface ParentConversationPage {
  items: Array<{
    id: string;
    kind: "PARENT_STAFF";
    title: "School team";
    latestMessage: { preview: string; createdAt: string } | null;
    updatedAt: string;
    unreadCount: number;
  }>;
  nextCursor: null;
}

@Injectable()
export class ParentMessagingService {
  async list(siteId: string, userId: string): Promise<ParentConversationPage> {
    if (
      !siteId.trim() ||
      !userId.trim() ||
      !SYSTEM_ROLE_TEMPLATES.parent.permissions.includes(READ_PERMISSION)
    ) {
      throw new NotFoundException("Messages not found");
    }

    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: {
        orgId: true,
        org: { select: { parentPortalEnabled: true } },
      },
    });
    if (!site?.org.parentPortalEnabled) {
      throw new NotFoundException("Messages not found");
    }

    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const now = new Date();
      const [user, guardian, student, permission] = await Promise.all([
        tx.user.findFirst({
          where: { id: userId, isActive: true },
          select: { id: true },
        }),
        tx.guardianIdentity.findFirst({
          where: {
            tenantId: siteId,
            userId,
            relationships: {
              some: {
                tenantId: siteId,
                legalAccess: "FULL",
                startsAt: { lte: now },
                endedAt: null,
                revokedAt: null,
                child: { tenantId: siteId, isGuest: false },
              },
            },
          },
          select: { id: true },
        }),
        tx.studentIdentity.findUnique({
          where: { tenantId_userId: { tenantId: siteId, userId } },
          select: { id: true },
        }),
        tx.permissionDefinition.findUnique({
          where: { key: READ_PERMISSION },
          select: { isActive: true },
        }),
      ]);
      if (!user || !guardian || student || !permission?.isActive) {
        throw new NotFoundException("Messages not found");
      }

      const conversation = await tx.messageConversation.findFirst({
        where: {
          tenantId: siteId,
          kind: "PARENT_STAFF",
          guardianIdentityId: guardian.id,
          participants: {
            some: {
              tenantId: siteId,
              userId,
              kind: "GUARDIAN",
              guardianIdentityId: guardian.id,
              removedAt: null,
            },
          },
        },
        select: {
          id: true,
          kind: true,
          updatedAt: true,
          participants: {
            where: {
              tenantId: siteId,
              userId,
              kind: "GUARDIAN",
              guardianIdentityId: guardian.id,
              removedAt: null,
            },
            select: { id: true },
            take: 1,
          },
          messages: {
            orderBy: { sequence: "desc" },
            take: 1,
            select: { bodyEncrypted: true, createdAt: true },
          },
        },
      });
      if (!conversation) return { items: [], nextCursor: null };

      const participantId = conversation.participants[0]?.id;
      if (!participantId) {
        throw new NotFoundException("Messages not found");
      }
      const readCursor = await tx.messageParticipantReadCursor.findUnique({
        where: {
          tenantId_conversationId_participantId: {
            tenantId: siteId,
            conversationId: conversation.id,
            participantId,
          },
        },
        select: { lastReadSequence: true },
      });
      const unreadCount = await tx.message.count({
        where: {
          tenantId: siteId,
          conversationId: conversation.id,
          senderParticipantId: { not: participantId },
          sequence: { gt: readCursor?.lastReadSequence ?? 0 },
        },
      });
      const latest = conversation.messages[0];
      return {
        items: [
          {
            id: conversation.id,
            kind: "PARENT_STAFF",
            title: "School team",
            latestMessage: latest
              ? {
                  preview: latest.bodyEncrypted
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 160),
                  createdAt: latest.createdAt.toISOString(),
                }
              : null,
            updatedAt: conversation.updatedAt.toISOString(),
            unreadCount,
          },
        ],
        nextCursor: null,
      };
    });
  }
}
