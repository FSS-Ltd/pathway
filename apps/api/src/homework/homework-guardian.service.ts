import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { isAceVertical } from "@pathway/types";
import { siteCalendarDate } from "./homework-audience";

@Injectable()
export class HomeworkGuardianService {
  async list(siteId: string, childId: string, userId: string) {
    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: {
        orgId: true,
        timezone: true,
        org: {
          select: {
            parentPortalEnabled: true,
            orgVertical: { select: { vertical: true } },
          },
        },
      },
    });
    if (
      !site?.org.parentPortalEnabled ||
      !isAceVertical(site.org.orgVertical?.vertical)
    ) {
      throw new NotFoundException("Homework not found");
    }
    const now = new Date();
    const today = siteCalendarDate(now, site.timezone ?? "");
    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const [relationship, enrollment, student, permission] = await Promise.all(
        [
          tx.guardianChildRelationship.findFirst({
            where: {
              tenantId: siteId,
              childId,
              legalAccess: "FULL",
              startsAt: { lte: now },
              endedAt: null,
              revokedAt: null,
              guardianIdentity: {
                tenantId: siteId,
                userId,
                user: { isActive: true },
              },
              child: { tenantId: siteId, isGuest: false },
            },
            select: { id: true },
          }),
          tx.aceSchoolEnrollment.findFirst({
            where: {
              tenantId: siteId,
              childId,
              startsOn: { lte: today },
              OR: [{ endsOn: null }, { endsOn: { gte: today } }],
            },
            select: { id: true },
          }),
          tx.studentIdentity.findUnique({
            where: { tenantId_userId: { tenantId: siteId, userId } },
            select: { id: true },
          }),
          tx.permissionDefinition.findUnique({
            where: { key: "ace.parent.progress.read" },
            select: { isActive: true },
          }),
        ],
      );
      if (!relationship || !enrollment || student || !permission?.isActive) {
        throw new NotFoundException("Homework not found");
      }
      const recipients = await tx.aceHomeworkRecipient.findMany({
        where: {
          tenantId: siteId,
          childId,
          assignment: {
            tenantId: siteId,
            status: "PUBLISHED",
            publishedAt: { lte: now },
          },
        },
        select: {
          assignment: { select: { id: true, title: true, dueAt: true } },
          submission: {
            select: {
              status: true,
              versions: {
                orderBy: { number: "desc" },
                take: 1,
                select: {
                  review: {
                    select: {
                      decision: true,
                      studentFeedback: true,
                      releasedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { publishedAt: "desc" },
      });
      return recipients.map((recipient) => {
        const review = recipient.submission?.versions[0]?.review;
        return {
          ...recipient.assignment,
          status: recipient.submission?.status ?? "NOT_STARTED",
          feedback:
            review?.decision === "COMPLETED" && review.releasedAt
              ? review.studentFeedback
              : null,
          feedbackReleasedAt:
            review?.decision === "COMPLETED" ? review.releasedAt : null,
        };
      });
    });
  }
}
