import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { CreateParentConversationInput } from "./dto/messaging-command.dto";
import type { ParentRecipientQuery } from "./dto/messaging-query.dto";
import { withParentMessagingAccess } from "./parent-messaging-access";
import { parentResponderWhere } from "./parent-message-responder";

const CREATE_PERMISSION =
  "messaging.conversations.create" satisfies PermissionKey;

@Injectable()
export class ParentMessagingConversationService {
  async recipients(
    siteId: string,
    userId: string,
    query: ParentRecipientQuery,
  ) {
    return withParentMessagingAccess(
      siteId,
      userId,
      CREATE_PERMISSION,
      async (tx, _guardianId, orgId) => {
        const permission = await tx.permissionDefinition.findUnique({
          where: { key: "messaging.messages.send" },
          select: { isActive: true },
        });
        if (!permission?.isActive) return { items: [], hasMore: false };

        const limit = query.limit ?? 20;
        const rows = await tx.siteMembership.findMany({
          where: {
            ...parentResponderWhere(orgId, siteId, new Date()),
            userId: { not: userId },
            ...(query.search
              ? {
                  AND: [
                    {
                      user: {
                        OR: [
                          {
                            displayName: {
                              contains: query.search,
                              mode: "insensitive",
                            },
                          },
                          {
                            name: {
                              contains: query.search,
                              mode: "insensitive",
                            },
                          },
                        ],
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            userId: true,
            user: { select: { displayName: true, name: true } },
          },
          orderBy: [{ user: { displayName: "asc" } }, { userId: "asc" }],
          take: limit + 1,
        });
        return {
          items: rows.slice(0, limit).map((row) => ({
            id: row.userId,
            displayName:
              row.user.displayName?.trim() ||
              row.user.name?.trim() ||
              "School team member",
          })),
          hasMore: rows.length > limit,
        };
      },
    );
  }

  async open(
    siteId: string,
    userId: string,
    input: CreateParentConversationInput,
  ) {
    return withParentMessagingAccess(
      siteId,
      userId,
      CREATE_PERMISSION,
      async (tx, guardianId, orgId) => {
        const lockKey = `ace-parent-staff:${siteId}:${guardianId}`;
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
        );
        const existing = await tx.messageConversation.findFirst({
          where: {
            tenantId: siteId,
            kind: "PARENT_STAFF",
            guardianIdentityId: guardianId,
          },
          select: {
            id: true,
            participants: {
              where: {
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
        if (existing) {
          if (!existing.participants.length) {
            throw new NotFoundException("Messages not found");
          }
          return {
            id: existing.id,
            kind: "PARENT_STAFF" as const,
            created: false,
          };
        }

        const permission = await tx.permissionDefinition.findUnique({
          where: { key: "messaging.messages.send" },
          select: { isActive: true },
        });
        const recipient =
          permission?.isActive && input.recipientUserId !== userId
            ? await tx.siteMembership.findFirst({
                where: parentResponderWhere(
                  orgId,
                  siteId,
                  new Date(),
                  input.recipientUserId,
                ),
                select: { userId: true },
              })
            : null;
        if (!recipient) {
          throw new NotFoundException("Staff responder not found");
        }

        const created = await tx.messageConversation.create({
          data: {
            kind: "PARENT_STAFF",
            tenant: { connect: { id: siteId } },
            guardianIdentity: {
              connect: { id_tenantId: { id: guardianId, tenantId: siteId } },
            },
            createdBy: { connect: { id: userId } },
            participants: {
              create: [
                {
                  kind: "GUARDIAN",
                  tenant: { connect: { id: siteId } },
                  user: { connect: { id: userId } },
                  guardianIdentity: {
                    connect: {
                      id_tenantId: { id: guardianId, tenantId: siteId },
                    },
                  },
                },
                {
                  kind: "STAFF",
                  tenant: { connect: { id: siteId } },
                  user: { connect: { id: recipient.userId } },
                },
              ],
            },
          },
          select: { id: true },
        });
        await recordAuditEventInTransaction(tx, {
          actorUserId: userId,
          tenantId: siteId,
          orgId,
          entityType: AuditEntityType.ACE_MESSAGE,
          entityId: created.id,
          action: AuditAction.CREATED,
          metadata: { kind: "PARENT_STAFF", recipientUserId: recipient.userId },
        });
        return { id: created.id, kind: "PARENT_STAFF" as const, created: true };
      },
    );
  }
}
