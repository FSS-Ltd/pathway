import { createHash } from "node:crypto";
import type { Prisma } from "@pathway/db";
import type { CreateNoticeDraftDto } from "./dto/ace-notice-draft.dto";
import {
  resolveSchoolNoticeAudience,
  type NoticeAudienceTarget,
} from "./ace-notice-school-audience";

export interface NoticeRecipient {
  recipientUserId: string;
  recipientKind: "GUARDIAN" | "STAFF";
  guardianIdentityId: string | null;
  targetedChildIds?: string[];
}

export async function resolveNoticeAudience(
  tx: Prisma.TransactionClient,
  tenantId: string,
  audience: CreateNoticeDraftDto["audience"],
  parentPortalEnabled: boolean,
  now: Date,
  target: NoticeAudienceTarget = {
    audienceScope: "SITE",
    audienceTargetId: null,
  },
): Promise<NoticeRecipient[]> {
  if (target.audienceScope !== "SITE") {
    return resolveSchoolNoticeAudience(
      tx,
      tenantId,
      audience,
      parentPortalEnabled,
      now,
      target,
    );
  }
  const includeStaff = audience !== "PARENTS";
  const includeParents = audience !== "STAFF" && parentPortalEnabled;
  const parentPermission = includeParents
    ? await tx.permissionDefinition.findUnique({
        where: { key: "ace.parent.notices.read" },
        select: { isActive: true },
      })
    : null;
  const [staff, guardians] = await Promise.all([
    includeStaff
      ? tx.siteMembership.findMany({
          where: {
            tenantId,
            user: {
              isActive: true,
              studentIdentities: { none: { tenantId } },
            },
          },
          select: { userId: true },
        })
      : [],
    includeParents && parentPermission?.isActive
      ? tx.guardianIdentity.findMany({
          where: {
            tenantId,
            user: {
              isActive: true,
              studentIdentities: { none: { tenantId } },
            },
            relationships: {
              some: {
                tenantId,
                legalAccess: "FULL",
                startsAt: { lte: now },
                endedAt: null,
                revokedAt: null,
                child: { tenantId, isGuest: false },
              },
            },
          },
          select: { id: true, userId: true },
          orderBy: { id: "asc" },
        })
      : [],
  ]);

  const recipients = new Map<string, NoticeRecipient>();
  for (const member of staff) {
    recipients.set(member.userId, {
      recipientUserId: member.userId,
      recipientKind: "STAFF",
      guardianIdentityId: null,
    });
  }
  for (const guardian of guardians) {
    recipients.set(guardian.userId, {
      recipientUserId: guardian.userId,
      recipientKind: "GUARDIAN",
      guardianIdentityId: guardian.id,
    });
  }
  return [...recipients.values()].sort((a, b) =>
    a.recipientUserId.localeCompare(b.recipientUserId),
  );
}

export function audienceVersion(
  tenantId: string,
  noticeId: string,
  recipients: NoticeRecipient[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        tenantId,
        noticeId,
        recipients.map((recipient) => [
          recipient.recipientUserId,
          recipient.recipientKind,
          recipient.guardianIdentityId,
          ...(recipient.targetedChildIds ? [recipient.targetedChildIds] : []),
        ]),
      ]),
    )
    .digest("hex");
}
