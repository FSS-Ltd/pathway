import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { withParentSiteAccess } from "../common/access/parent-site-access";
import { acknowledgeNoticeReceipt } from "./ace-notice-acknowledgement";
import {
  decodeNoticeCursor,
  encodeNoticeCursor,
  noticeCursorScope,
  type NoticeCursorPosition,
} from "./ace-notice-cursor";
import type { ListNoticeInboxDto } from "./dto/ace-notice-inbox.dto";

export interface ParentNoticeSummary {
  id: string;
  title: string;
  publishedAt: Date;
  expiresAt: Date | null;
  deliveredAt: Date;
  readAt: Date | null;
  requiresAcknowledgement: boolean;
  acknowledgedAt: Date | null;
}

export interface ParentNoticePage {
  items: ParentNoticeSummary[];
  nextCursor: string | null;
}

export interface ParentNoticeDetail extends ParentNoticeSummary {
  body: string;
}

function recipientScope(
  siteId: string,
  userId: string,
  guardianId: string,
  childIds: string[],
) {
  return {
    tenantId: siteId,
    recipientUserId: userId,
    recipientKind: "GUARDIAN" as const,
    guardianIdentityId: guardianId,
    OR: [
      { targetedChildIds: { isEmpty: true } },
      { targetedChildIds: { hasSome: childIds } },
    ],
    receipt: { is: { deliveredAt: { not: null } } },
  };
}

function activeParentNoticeScope(
  siteId: string,
  userId: string,
  guardianId: string,
  childIds: string[],
  now: Date,
  cursor?: NoticeCursorPosition,
): Prisma.AceNoticeWhereInput {
  return {
    tenantId: siteId,
    audience: { in: ["PARENTS", "PARENTS_AND_STAFF"] },
    legacyImportedAt: null,
    publishedAt: { not: null, lte: now },
    withdrawnAt: null,
    audienceMembers: {
      some: recipientScope(siteId, userId, guardianId, childIds),
    },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ...(cursor
        ? [
            {
              OR: [
                { publishedAt: { lt: cursor.publishedAt } },
                { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
              ],
            },
          ]
        : []),
    ],
  };
}

async function currentGuardianChildIds(
  tx: Prisma.TransactionClient,
  siteId: string,
  guardianId: string,
): Promise<string[]> {
  const links = await tx.guardianChildRelationship.findMany({
    where: {
      tenantId: siteId,
      guardianIdentityId: guardianId,
      legalAccess: "FULL",
      startsAt: { lte: new Date() },
      endedAt: null,
      revokedAt: null,
      child: { tenantId: siteId, isGuest: false },
    },
    select: { childId: true },
  });
  return links.map((link) => link.childId);
}

function summary(row: {
  id: string;
  title: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  requiresAcknowledgement: boolean;
  audienceMembers: Array<{
    receipt: {
      deliveredAt: Date | null;
      readAt: Date | null;
      acknowledgedAt: Date | null;
    } | null;
  }>;
}): ParentNoticeSummary {
  const receipt = row.audienceMembers[0]?.receipt;
  if (!row.publishedAt || !receipt?.deliveredAt) {
    throw new Error("Parent notice query returned an invalid delivery");
  }
  return {
    id: row.id,
    title: row.title,
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt,
    deliveredAt: receipt.deliveredAt,
    readAt: receipt.readAt,
    requiresAcknowledgement: row.requiresAcknowledgement,
    acknowledgedAt: receipt.acknowledgedAt,
  };
}

@Injectable()
export class AceNoticeParentInboxService {
  async list(
    siteId: string,
    userId: string,
    query: ListNoticeInboxDto,
  ): Promise<ParentNoticePage> {
    return withParentSiteAccess(
      siteId,
      userId,
      "ace.parent.notices.read",
      "Notices not found",
      async (tx, guardianId) => {
        const childIds = await currentGuardianChildIds(tx, siteId, guardianId);
        const scope = noticeCursorScope(siteId, userId, "parent", guardianId);
        const cursor = query.cursor
          ? decodeNoticeCursor(query.cursor, scope)
          : undefined;
        const rows = await tx.aceNotice.findMany({
          where: activeParentNoticeScope(
            siteId,
            userId,
            guardianId,
            childIds,
            new Date(),
            cursor,
          ),
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          take: query.limit + 1,
          select: {
            id: true,
            title: true,
            publishedAt: true,
            expiresAt: true,
            requiresAcknowledgement: true,
            audienceMembers: {
              where: recipientScope(siteId, userId, guardianId, childIds),
              take: 1,
              select: {
                receipt: {
                  select: {
                    deliveredAt: true,
                    readAt: true,
                    acknowledgedAt: true,
                  },
                },
              },
            },
          },
        });
        const items = rows.slice(0, query.limit).map(summary);
        const last = items.at(-1);
        return {
          items,
          nextCursor:
            rows.length > query.limit && last
              ? encodeNoticeCursor(last, scope)
              : null,
        };
      },
    );
  }

  async get(
    siteId: string,
    userId: string,
    id: string,
  ): Promise<ParentNoticeDetail> {
    return withParentSiteAccess(
      siteId,
      userId,
      "ace.parent.notices.read",
      "Notices not found",
      async (tx, guardianId) => {
        const childIds = await currentGuardianChildIds(tx, siteId, guardianId);
        const row = await tx.aceNotice.findFirst({
          where: {
            ...activeParentNoticeScope(
              siteId,
              userId,
              guardianId,
              childIds,
              new Date(),
            ),
            id,
          },
          select: {
            id: true,
            title: true,
            body: true,
            publishedAt: true,
            expiresAt: true,
            requiresAcknowledgement: true,
            audienceMembers: {
              where: recipientScope(siteId, userId, guardianId, childIds),
              take: 1,
              select: {
                receipt: {
                  select: {
                    deliveredAt: true,
                    readAt: true,
                    acknowledgedAt: true,
                  },
                },
              },
            },
          },
        });
        if (!row) throw new NotFoundException("Notice not found");
        return { ...summary(row), body: row.body };
      },
    );
  }

  async markRead(
    siteId: string,
    userId: string,
    id: string,
  ): Promise<{ readAt: Date }> {
    return withParentSiteAccess(
      siteId,
      userId,
      "ace.parent.notices.read",
      "Notices not found",
      async (tx, guardianId) => {
        const childIds = await currentGuardianChildIds(tx, siteId, guardianId);
        const row = await tx.aceNotice.findFirst({
          where: {
            ...activeParentNoticeScope(
              siteId,
              userId,
              guardianId,
              childIds,
              new Date(),
            ),
            id,
          },
          select: {
            audienceMembers: {
              where: recipientScope(siteId, userId, guardianId, childIds),
              take: 1,
              select: {
                receipt: {
                  select: { id: true, deliveredAt: true, readAt: true },
                },
              },
            },
          },
        });
        const receipt = row?.audienceMembers[0]?.receipt;
        if (!receipt?.deliveredAt)
          throw new NotFoundException("Notice not found");
        if (receipt.readAt) return { readAt: receipt.readAt };

        await tx.aceNoticeReceipt.updateMany({
          where: { id: receipt.id, tenantId: siteId, readAt: null },
          data: { readAt: new Date() },
        });
        const current = await tx.aceNoticeReceipt.findFirst({
          where: { id: receipt.id, tenantId: siteId },
          select: { readAt: true },
        });
        if (!current?.readAt) throw new NotFoundException("Notice not found");
        return { readAt: current.readAt };
      },
    );
  }

  async acknowledge(siteId: string, userId: string, id: string) {
    return withParentSiteAccess(
      siteId,
      userId,
      "ace.parent.notices.read",
      "Notices not found",
      async (tx, guardianId) => {
        const childIds = await currentGuardianChildIds(tx, siteId, guardianId);
        const notice = await tx.aceNotice.findFirst({
          where: {
            ...activeParentNoticeScope(
              siteId,
              userId,
              guardianId,
              childIds,
              new Date(),
            ),
            id,
          },
          select: {
            requiresAcknowledgement: true,
            audienceMembers: {
              where: recipientScope(siteId, userId, guardianId, childIds),
              take: 1,
              select: {
                receipt: { select: { id: true, deliveredAt: true } },
              },
            },
          },
        });
        const receipt = notice?.audienceMembers[0]?.receipt;
        if (!notice || !receipt?.deliveredAt)
          throw new NotFoundException("Notice not found");
        if (!notice.requiresAcknowledgement) {
          throw new ConflictException(
            "This notice does not require acknowledgement",
          );
        }
        return acknowledgeNoticeReceipt(tx, siteId, receipt.id);
      },
    );
  }
}
