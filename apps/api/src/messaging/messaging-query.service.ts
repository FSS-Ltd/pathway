import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import type {
  ConversationQuery,
  MessageQuery,
} from "./dto/messaging-query.dto";
import {
  decodeConversationCursor,
  encodeConversationCursor,
} from "./messaging-cursor";

const DEFAULT_LIMIT = 20;
const STAFF_KINDS = ["STAFF_DIRECT", "STAFF_ROOM"] as const;

export interface MessagingActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

@Injectable()
export class MessagingQueryService {
  async listStaffConversations(
    actor: MessagingActor,
    query: ConversationQuery,
  ) {
    assertActor(actor);
    let cursor: ReturnType<typeof decodeConversationCursor> | undefined;
    if (query.cursor) {
      try {
        cursor = decodeConversationCursor(
          query.cursor,
          actor.tenantId,
          actor.userId,
        );
      } catch {
        throw new BadRequestException("Invalid conversation cursor");
      }
    }
    const limit = query.limit ?? DEFAULT_LIMIT;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const rows = await tx.messageConversation.findMany({
        where: {
          tenantId: actor.tenantId,
          kind: { in: [...STAFF_KINDS] },
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
          ...(cursor
            ? {
                OR: [
                  { updatedAt: { lt: cursor.updatedAt } },
                  { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          kind: true,
          updatedAt: true,
          participants: {
            where: { removedAt: null },
            take: 3,
            select: {
              userId: true,
              user: { select: { displayName: true, name: true } },
            },
          },
          messages: {
            orderBy: { sequence: "desc" },
            take: 1,
            select: { bodyEncrypted: true, createdAt: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => {
          const other = row.participants.find(
            (participant) => participant.userId !== actor.userId,
          );
          const latest = row.messages[0];
          return {
            id: row.id,
            kind: row.kind,
            title:
              row.kind === "STAFF_ROOM"
                ? "Staff room"
                : other?.user.displayName?.trim() ||
                  other?.user.name?.trim() ||
                  "Staff member",
            latestMessage: latest
              ? {
                  preview: latest.bodyEncrypted
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 160),
                  createdAt: latest.createdAt.toISOString(),
                }
              : null,
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
        nextCursor:
          rows.length > limit && last
            ? encodeConversationCursor(last, actor.tenantId, actor.userId)
            : null,
      };
    });
  }

  async listStaffMessages(
    actor: MessagingActor,
    conversationId: string,
    query: MessageQuery,
  ) {
    assertActor(actor);
    const limit = query.limit ?? DEFAULT_LIMIT;
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const conversation = await tx.messageConversation.findFirst({
        where: {
          id: conversationId,
          tenantId: actor.tenantId,
          kind: { in: [...STAFF_KINDS] },
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
        },
        select: { id: true },
      });
      if (!conversation) throw new NotFoundException("Conversation not found");

      const rows = await tx.message.findMany({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          ...(query.before ? { sequence: { lt: query.before } } : {}),
        },
        select: {
          id: true,
          sequence: true,
          bodyEncrypted: true,
          createdAt: true,
          sender: {
            select: {
              userId: true,
              user: { select: { displayName: true, name: true } },
            },
          },
        },
        orderBy: { sequence: "desc" },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          body: row.bodyEncrypted,
          createdAt: row.createdAt.toISOString(),
          sender: {
            id: row.sender.userId,
            displayName:
              row.sender.user.displayName?.trim() ||
              row.sender.user.name?.trim() ||
              "Staff member",
          },
        })),
        nextBefore:
          rows.length > limit ? (page.at(-1)?.sequence ?? null) : null,
      };
    });
  }
}

function assertActor(actor: MessagingActor): void {
  if (
    !actor.tenantId?.trim() ||
    !actor.orgId?.trim() ||
    !actor.userId?.trim()
  ) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

async function requireCurrentStaff(
  tx: Prisma.TransactionClient,
  actor: MessagingActor,
): Promise<void> {
  const [site, membership, student, user] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    }),
    tx.siteMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
        role: { in: ["SITE_ADMIN", "STAFF"] },
      },
      select: { id: true },
    }),
    tx.studentIdentity.findUnique({
      where: {
        tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
      },
      select: { id: true },
    }),
    tx.user.findFirst({
      where: { id: actor.userId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!site) throw new NotFoundException("Active site not found");
  if (!membership || student || !user)
    throw new ForbiddenException("Staff messaging unavailable");
}
