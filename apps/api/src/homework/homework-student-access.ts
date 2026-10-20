import { NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext, type Prisma } from "@pathway/db";
import { isAceVertical } from "@pathway/types";
import { requireCurrentStudent } from "../student-self/current-student";
import { siteCalendarDate } from "./homework-audience";

export interface StudentHomeworkContext {
  tx: Prisma.TransactionClient;
  tenantId: string;
  orgId: string;
  userId: string;
  childId: string;
  now: Date;
}

export async function withStudentHomework<T>(
  tenantId: string,
  userId: string,
  action: (context: StudentHomeworkContext) => Promise<T>,
): Promise<T> {
  const site = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      orgId: true,
      timezone: true,
      org: { select: { orgVertical: { select: { vertical: true } } } },
    },
  });
  if (!site || !isAceVertical(site.org.orgVertical?.vertical)) {
    throw new NotFoundException("Homework assignment not found");
  }
  const now = new Date();
  const today = siteCalendarDate(now, site.timezone ?? "");
  return withTenantRlsContext(tenantId, site.orgId, async (tx) => {
    const child = await requireCurrentStudent(
      tx,
      tenantId,
      userId,
      now,
      today.toISOString().slice(0, 10),
      "Homework assignment not found",
    );
    return action({
      tx,
      tenantId,
      orgId: site.orgId,
      userId,
      childId: child.id,
      now,
    });
  });
}

export async function requireReleasedRecipient(
  context: StudentHomeworkContext,
  assignmentId: string,
) {
  await context.tx.$queryRaw`
    SELECT "id" FROM "AceHomeworkAssignment"
    WHERE "id" = ${assignmentId} AND "tenantId" = ${context.tenantId}
    FOR SHARE
  `;
  const recipient = await context.tx.aceHomeworkRecipient.findFirst({
    where: {
      tenantId: context.tenantId,
      assignmentId,
      childId: context.childId,
      assignment: {
        tenantId: context.tenantId,
        status: "PUBLISHED",
        publishedAt: { lte: context.now },
      },
    },
    select: {
      id: true,
      assignment: {
        select: {
          id: true,
          title: true,
          instructions: true,
          dueAt: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!recipient) throw new NotFoundException("Homework assignment not found");
  return recipient;
}
