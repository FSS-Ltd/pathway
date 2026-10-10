import { GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";

export type Audience = "ALL" | "PARENTS" | "STAFF";

const noticeSelect = {
  id: true,
  title: true,
  body: true,
  audience: true,
  requiresAcknowledgement: true,
  publishedAt: true,
  withdrawnAt: true,
  legacyImportedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type NoticeRow = Prisma.AceNoticeGetPayload<{
  select: typeof noticeSelect;
}>;

function legacyAudience(audience: NoticeRow["audience"]): Audience {
  return audience === "PARENTS_AND_STAFF" ? "ALL" : audience;
}

function presentNotice(row: NoticeRow) {
  const status = row.withdrawnAt
    ? "archived"
    : row.publishedAt
      ? row.publishedAt.getTime() > Date.now()
        ? "scheduled"
        : "sent"
      : "draft";
  return {
    ...row,
    audience: legacyAudience(row.audience),
    status,
    scheduledAt: status === "scheduled" ? row.publishedAt : null,
  };
}

/** Transitional read adapter for the existing admin and dashboard screens. */
@Injectable()
export class AnnouncementsService {
  async findAll(filters: {
    tenantId: string;
    orgId: string;
    audience?: Audience;
    publishedOnly?: boolean;
  }) {
    return withTenantRlsContext(filters.tenantId, filters.orgId, async (tx) => {
      const rows = await tx.aceNotice.findMany({
        where: {
          tenantId: filters.tenantId,
          ...(filters.audience
            ? {
                audience:
                  filters.audience === "ALL"
                    ? "PARENTS_AND_STAFF"
                    : filters.audience,
              }
            : {}),
          ...(filters.publishedOnly ? { publishedAt: { not: null } } : {}),
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: noticeSelect,
      });
      return rows.map(presentNotice);
    });
  }

  async findOne(id: string, tenantId: string, orgId: string) {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const row = await tx.aceNotice.findFirst({
        where: { id, tenantId },
        select: noticeSelect,
      });
      if (!row) throw new NotFoundException("Notice not found");
      return presentNotice(row);
    });
  }

  retiredWrite(): never {
    throw new GoneException(
      "Use the site notice draft, preview, publish, and withdraw commands",
    );
  }
}
