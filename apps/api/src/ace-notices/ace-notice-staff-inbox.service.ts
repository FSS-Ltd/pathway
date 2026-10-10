import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { acknowledgeNoticeReceipt } from "./ace-notice-acknowledgement";
import {
  assertNoticeActor,
  requireSiteNoticeStaffAccess,
  type NoticeActor,
} from "./ace-notice-access";
import {
  decodeNoticeCursor,
  encodeNoticeCursor,
  noticeCursorScope,
  type NoticeCursorPosition,
} from "./ace-notice-cursor";
import type { ListNoticeInboxDto } from "./dto/ace-notice-inbox.dto";

export interface StaffNoticeSummary {
  id: string;
  title: string;
  audience: "STAFF" | "PARENTS_AND_STAFF";
  historical: boolean;
  publishedAt: Date;
  expiresAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  requiresAcknowledgement: boolean;
  acknowledgedAt: Date | null;
}

export interface StaffNoticePage {
  items: StaffNoticeSummary[];
  nextCursor: string | null;
}

export interface StaffNoticeDetail extends StaffNoticeSummary {
  body: string;
}

function activeStaffNoticeScope(
  actor: NoticeActor,
  now: Date,
  cursor?: NoticeCursorPosition,
): Prisma.AceNoticeWhereInput {
  return {
    tenantId: actor.tenantId,
    audience: { in: ["STAFF", "PARENTS_AND_STAFF"] },
    publishedAt: { not: null, lte: now },
    withdrawnAt: null,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      {
        OR: [
          { legacyImportedAt: { not: null } },
          {
            audienceMembers: {
              some: { tenantId: actor.tenantId, recipientUserId: actor.userId },
            },
          },
        ],
      },
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

@Injectable()
export class AceNoticeStaffInboxService {
  async list(
    query: ListNoticeInboxDto,
    actor: NoticeActor,
  ): Promise<StaffNoticePage> {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      const scope = noticeCursorScope(actor.tenantId, actor.userId);
      const cursor = query.cursor
        ? decodeNoticeCursor(query.cursor, scope)
        : undefined;
      const rows = await tx.aceNotice.findMany({
        where: activeStaffNoticeScope(actor, new Date(), cursor),
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: {
          id: true,
          title: true,
          audience: true,
          publishedAt: true,
          expiresAt: true,
          requiresAcknowledgement: true,
          legacyImportedAt: true,
          audienceMembers: {
            where: { tenantId: actor.tenantId, recipientUserId: actor.userId },
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
      const items = rows.slice(0, query.limit).map((row) => this.summary(row));
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last
            ? encodeNoticeCursor(last, scope)
            : null,
      };
    });
  }

  async get(id: string, actor: NoticeActor): Promise<StaffNoticeDetail> {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      const row = await tx.aceNotice.findFirst({
        where: { ...activeStaffNoticeScope(actor, new Date()), id },
        select: {
          id: true,
          title: true,
          body: true,
          audience: true,
          publishedAt: true,
          expiresAt: true,
          requiresAcknowledgement: true,
          legacyImportedAt: true,
          audienceMembers: {
            where: { tenantId: actor.tenantId, recipientUserId: actor.userId },
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
      return { ...this.summary(row), body: row.body };
    });
  }

  async markRead(id: string, actor: NoticeActor): Promise<{ readAt: Date }> {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      const notice = await tx.aceNotice.findFirst({
        where: { ...activeStaffNoticeScope(actor, new Date()), id },
        select: {
          audienceMembers: {
            where: { tenantId: actor.tenantId, recipientUserId: actor.userId },
            select: {
              receipt: {
                select: { id: true, deliveredAt: true, readAt: true },
              },
            },
          },
        },
      });
      const receipt = notice?.audienceMembers[0]?.receipt;
      if (!receipt?.deliveredAt)
        throw new NotFoundException("Notice not found");
      if (receipt.readAt) return { readAt: receipt.readAt };

      await tx.aceNoticeReceipt.updateMany({
        where: { id: receipt.id, tenantId: actor.tenantId, readAt: null },
        data: { readAt: new Date() },
      });
      const current = await tx.aceNoticeReceipt.findFirst({
        where: { id: receipt.id, tenantId: actor.tenantId },
        select: { readAt: true },
      });
      if (!current?.readAt) throw new NotFoundException("Notice not found");
      return { readAt: current.readAt };
    });
  }

  async acknowledge(id: string, actor: NoticeActor) {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      const notice = await tx.aceNotice.findFirst({
        where: { ...activeStaffNoticeScope(actor, new Date()), id },
        select: {
          requiresAcknowledgement: true,
          audienceMembers: {
            where: { tenantId: actor.tenantId, recipientUserId: actor.userId },
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
      return acknowledgeNoticeReceipt(tx, actor.tenantId, receipt.id);
    });
  }

  private summary(row: {
    id: string;
    title: string;
    audience: "PARENTS" | "STAFF" | "PARENTS_AND_STAFF";
    publishedAt: Date | null;
    expiresAt: Date | null;
    requiresAcknowledgement: boolean;
    legacyImportedAt: Date | null;
    audienceMembers: Array<{
      receipt: {
        deliveredAt: Date | null;
        readAt: Date | null;
        acknowledgedAt: Date | null;
      } | null;
    }>;
  }): StaffNoticeSummary {
    if (!row.publishedAt || row.audience === "PARENTS") {
      throw new Error("Staff notice query returned an invalid publication");
    }
    const receipt = row.audienceMembers[0]?.receipt;
    return {
      id: row.id,
      title: row.title,
      audience: row.audience,
      historical: row.legacyImportedAt !== null,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      deliveredAt: receipt?.deliveredAt ?? null,
      readAt: receipt?.readAt ?? null,
      requiresAcknowledgement: row.requiresAcknowledgement,
      acknowledgedAt: receipt?.acknowledgedAt ?? null,
    };
  }
}
