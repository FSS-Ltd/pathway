import { Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { siteCalendarDate } from "../homework/homework-audience";
import { validConsentVersionIds } from "./permission-slip-consent-versions";
import { requireTripSlipStaff, type TripSlipActor } from "./trip-slip-access";

@Injectable()
export class PermissionSlipStaffReadService {
  async audienceOptions(actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      const site = await tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { timezone: true },
      });
      if (!site) throw new NotFoundException("School site not found");
      const today = siteCalendarDate(new Date(), site.timezone);
      const [enrollments, staff] = await Promise.all([
        tx.aceSchoolEnrollment.findMany({
          where: {
            tenantId: actor.tenantId,
            startsOn: { lte: today },
            OR: [{ endsOn: null }, { endsOn: { gte: today } }],
            child: { isGuest: false },
          },
          orderBy: [
            { child: { lastName: "asc" } },
            { child: { firstName: "asc" } },
          ],
          take: 501,
          select: {
            childId: true,
            child: { select: { firstName: true, lastName: true } },
          },
        }),
        tx.siteMembership.findMany({
          where: {
            tenantId: actor.tenantId,
            role: { in: ["SITE_ADMIN", "STAFF"] },
            user: { isActive: true },
          },
          orderBy: { user: { name: "asc" } },
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        }),
      ]);
      const children = [
        ...new Map(
          enrollments.slice(0, 500).map(({ childId, child }) => [
            childId,
            {
              id: childId,
              name: `${child.firstName} ${child.lastName}`.trim(),
            },
          ]),
        ).values(),
      ];
      return {
        children,
        limitReached: enrollments.length > 500,
        publicationEnabled:
          process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED === "true",
        witnesses: staff
          .filter(({ userId }) => userId !== actor.userId)
          .map(({ userId, user }) => ({
            id: userId,
            name: user.name ?? user.email ?? "Staff member",
          })),
      };
    });
  }

  async staffSummary(slipId: string, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      const slip = await tx.permissionSlip.findFirst({
        where: { id: slipId, tenantId: actor.tenantId },
        select: {
          id: true,
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { version: "desc" },
            select: {
              id: true,
              version: true,
              versionHash: true,
              requiresReconsent: true,
            },
          },
        },
      });
      const current = slip?.versions[0];
      if (!slip || !current?.versionHash)
        throw new NotFoundException("Published permission slip not found");
      const validIds = validConsentVersionIds(slip.versions);
      const recipients = await tx.permissionSlipRecipient.findMany({
        where: {
          tenantId: actor.tenantId,
          permissionSlipVersionId: current.id,
        },
        orderBy: [{ child: { lastName: "asc" } }, { childId: "asc" }],
        select: {
          childId: true,
          child: { select: { firstName: true, lastName: true } },
        },
      });
      const childIds = recipients.map(({ childId }) => childId);
      const [responses, exceptions] = await Promise.all([
        tx.permissionSlipResponse.findMany({
          where: {
            tenantId: actor.tenantId,
            childId: { in: childIds },
            permissionSlipVersionId: { in: validIds },
          },
          select: { childId: true, decision: true },
        }),
        tx.permissionSlipException.findMany({
          where: {
            tenantId: actor.tenantId,
            childId: { in: childIds },
            permissionSlipVersionId: { in: validIds },
          },
          select: { childId: true, decision: true, source: true },
        }),
      ]);
      const rows = recipients.map((recipient) => ({
        childId: recipient.childId,
        childName:
          `${recipient.child.firstName} ${recipient.child.lastName}`.trim(),
        responseCount: responses.filter(
          (response) => response.childId === recipient.childId,
        ).length,
        exception:
          exceptions.find(
            (exception) => exception.childId === recipient.childId,
          ) ?? null,
      }));
      return {
        slipId,
        versionId: current.id,
        version: current.version,
        versionHash: current.versionHash,
        audienceChildren: rows.length,
        childrenWithResponse: rows.filter(
          (row) => row.responseCount > 0 || row.exception,
        ).length,
        childrenWithoutResponse: rows.filter(
          (row) => row.responseCount === 0 && !row.exception,
        ).length,
        acceptedResponses: responses.filter(
          (response) => response.decision === "ACCEPTED",
        ).length,
        declinedResponses: responses.filter(
          (response) => response.decision === "DECLINED",
        ).length,
        exceptions: exceptions.length,
        rows,
      };
    });
  }
}
