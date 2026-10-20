import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { requireStaffAccess } from "./homework-access";
import { siteCalendarDate } from "./homework-audience";
import type { HomeworkEmailPayload } from "./homework-notifications";
import { requireCurrentStudent } from "../student-self/current-student";

export async function resolveHomeworkEmailRecipient(
  orgId: string,
  payload: HomeworkEmailPayload,
): Promise<string | null> {
  return withTenantRlsContext(payload.tenantId, orgId, async (tx) => {
    const [site, recipient, user] = await Promise.all([
      tx.tenant.findFirst({
        where: { id: payload.tenantId, orgId },
        select: {
          timezone: true,
          org: { select: { parentPortalEnabled: true } },
        },
      }),
      tx.aceHomeworkRecipient.findFirst({
        where: {
          id: payload.recipientId,
          tenantId: payload.tenantId,
          assignment: { tenantId: payload.tenantId, status: "PUBLISHED" },
        },
        select: {
          childId: true,
          child: { select: { isGuest: true } },
          assignment: { select: { yearBandId: true } },
        },
      }),
      tx.user.findFirst({
        where: { id: payload.userId, isActive: true },
        select: { email: true },
      }),
    ]);
    if (!site || !recipient || recipient.child.isGuest || !user?.email)
      return null;
    if (!(await sourceIsCurrent(tx, payload))) return null;
    if (payload.audience === "STAFF") {
      try {
        await requireStaffAccess(
          tx,
          {
            tenantId: payload.tenantId,
            orgId,
            userId: payload.userId,
          },
          recipient.assignment.yearBandId,
        );
        return user.email;
      } catch (error) {
        if (
          !(
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          )
        )
          throw error;
        return null;
      }
    }
    if (!site.org.parentPortalEnabled) return null;
    const today = siteCalendarDate(new Date(), site.timezone ?? "");
    const enrollment = await tx.aceSchoolEnrollment.findFirst({
      where: {
        tenantId: payload.tenantId,
        childId: recipient.childId,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
      },
      select: { id: true },
    });
    if (!enrollment) return null;
    if (payload.audience === "STUDENT") {
      try {
        const student = await requireCurrentStudent(
          tx,
          payload.tenantId,
          payload.userId,
          new Date(),
          today.toISOString().slice(0, 10),
        );
        return student.id === recipient.childId ? user.email : null;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        return null;
      }
    }
    const [guardian, studentIdentity] = await Promise.all([
      tx.guardianChildRelationship.findFirst({
        where: {
          tenantId: payload.tenantId,
          childId: recipient.childId,
          legalAccess: "FULL",
          startsAt: { lte: new Date() },
          endedAt: null,
          revokedAt: null,
          guardianIdentity: {
            tenantId: payload.tenantId,
            userId: payload.userId,
          },
        },
        select: { id: true },
      }),
      tx.studentIdentity.findUnique({
        where: {
          tenantId_userId: {
            tenantId: payload.tenantId,
            userId: payload.userId,
          },
        },
        select: { id: true },
      }),
    ]);
    return guardian && !studentIdentity ? user.email : null;
  });
}

async function sourceIsCurrent(
  tx: Prisma.TransactionClient,
  payload: HomeworkEmailPayload,
): Promise<boolean> {
  if (payload.action === "ASSIGNED") {
    if (payload.audience === "STAFF") return false;
    const assignment = await tx.aceHomeworkAssignment.findFirst({
      where: {
        id: payload.sourceId,
        tenantId: payload.tenantId,
        recipients: {
          some: { id: payload.recipientId, tenantId: payload.tenantId },
        },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }
  if (payload.action === "SUBMITTED") {
    if (payload.audience !== "STAFF") return false;
    const version = await tx.aceHomeworkSubmissionVersion.findFirst({
      where: {
        id: payload.sourceId,
        tenantId: payload.tenantId,
        submission: {
          recipientId: payload.recipientId,
          tenantId: payload.tenantId,
        },
      },
      select: { id: true },
    });
    return Boolean(version);
  }
  if (payload.action === "RETURNED" && payload.audience !== "STUDENT")
    return false;
  if (payload.action === "RELEASED" && payload.audience !== "GUARDIAN")
    return false;
  const review = await tx.aceHomeworkReview.findFirst({
    where: {
      id: payload.sourceId,
      tenantId: payload.tenantId,
      decision: payload.action === "RETURNED" ? "RETURNED" : "COMPLETED",
      ...(payload.action === "RELEASED" ? { releasedAt: { not: null } } : {}),
      version: {
        submission: {
          recipientId: payload.recipientId,
          tenantId: payload.tenantId,
        },
      },
    },
    select: { id: true },
  });
  return Boolean(review);
}
