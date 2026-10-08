import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import type { CreateStaffDirectConversationInput } from "./dto/messaging-command.dto";
import type { StaffRecipientQuery } from "./dto/messaging-query.dto";
import {
  assertMessagingActor,
  requireCurrentStaff,
  type MessagingActor,
} from "./messaging-access";

@Injectable()
export class MessagingConversationService {
  async listStaffRecipients(actor: MessagingActor, query: StaffRecipientQuery) {
    assertMessagingActor(actor);
    const limit = query.limit ?? 20;
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const rows = await tx.siteMembership.findMany({
        where: {
          tenantId: actor.tenantId,
          userId: { not: actor.userId },
          role: { in: ["SITE_ADMIN", "STAFF"] },
          user: {
            isActive: true,
            studentIdentities: { none: { tenantId: actor.tenantId } },
            ...(query.search
              ? {
                  OR: [
                    {
                      displayName: {
                        contains: query.search,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      name: {
                        contains: query.search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                }
              : {}),
          },
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
            "Staff member",
        })),
        hasMore: rows.length > limit,
      };
    });
  }

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

  async openStaffRoom(actor: MessagingActor) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const lockKey = `ace-staff-room:${actor.tenantId}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );

      const memberships = await tx.siteMembership.findMany({
        where: {
          tenantId: actor.tenantId,
          role: { in: ["SITE_ADMIN", "STAFF"] },
          user: {
            isActive: true,
            studentIdentities: { none: { tenantId: actor.tenantId } },
          },
        },
        select: { userId: true },
      });
      const staffIds = memberships.map((member) => member.userId).sort();
      if (staffIds.length < 2) {
        throw new BadRequestException(
          "At least two current staff members are required",
        );
      }

      const rooms = await tx.messageConversation.findMany({
        where: { tenantId: actor.tenantId, kind: "STAFF_ROOM" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 2,
        select: { id: true },
      });
      if (rooms.length > 1) {
        throw new ConflictException("Staff room unavailable");
      }
      const room = rooms[0];
      if (!room) {
        const created = await tx.messageConversation.create({
          data: {
            kind: "STAFF_ROOM",
            tenant: { connect: { id: actor.tenantId } },
            createdBy: { connect: { id: actor.userId } },
            participants: {
              create: staffIds.map((userId) => ({
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
          metadata: { kind: "STAFF_ROOM", participantUserIds: staffIds },
        });
        return { id: created.id, kind: "STAFF_ROOM" as const, created: true };
      }

      const participants = await tx.messageParticipant.findMany({
        where: { tenantId: actor.tenantId, conversationId: room.id },
        select: { userId: true, removedAt: true },
      });
      const staffSet = new Set(staffIds);
      const participantSet = new Set(participants.map((item) => item.userId));
      const addedUserIds = staffIds.filter(
        (userId) => !participantSet.has(userId),
      );
      const rejoinedUserIds = participants
        .filter((item) => item.removedAt && staffSet.has(item.userId))
        .map((item) => item.userId);
      const removedUserIds = participants
        .filter((item) => !item.removedAt && !staffSet.has(item.userId))
        .map((item) => item.userId);

      if (removedUserIds.length) {
        await tx.messageParticipant.updateMany({
          where: {
            tenantId: actor.tenantId,
            conversationId: room.id,
            userId: { in: removedUserIds },
            removedAt: null,
          },
          data: { removedAt: new Date() },
        });
      }
      if (rejoinedUserIds.length) {
        await tx.messageParticipant.updateMany({
          where: {
            tenantId: actor.tenantId,
            conversationId: room.id,
            userId: { in: rejoinedUserIds },
            removedAt: { not: null },
          },
          data: { removedAt: null },
        });
      }
      if (addedUserIds.length) {
        await tx.messageParticipant.createMany({
          data: addedUserIds.map((userId) => ({
            tenantId: actor.tenantId,
            conversationId: room.id,
            userId,
            kind: "STAFF",
          })),
        });
      }
      if (
        addedUserIds.length ||
        rejoinedUserIds.length ||
        removedUserIds.length
      ) {
        await recordAuditEventInTransaction(tx, {
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          entityType: AuditEntityType.ACE_MESSAGE,
          entityId: room.id,
          action: AuditAction.UPDATED,
          metadata: {
            kind: "STAFF_ROOM",
            addedUserIds,
            rejoinedUserIds,
            removedUserIds,
          },
        });
      }
      return { id: room.id, kind: "STAFF_ROOM" as const, created: false };
    });
  }
}
