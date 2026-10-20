import type { Prisma } from "@pathway/db";
import type { OutboxService } from "../common/outbox/outbox.service";

export type HomeworkEmailAudience = "STUDENT" | "GUARDIAN" | "STAFF";
export type HomeworkEmailAction =
  | "ASSIGNED"
  | "SUBMITTED"
  | "RETURNED"
  | "RELEASED";

export interface HomeworkEmailPayload {
  tenantId: string;
  recipientId: string;
  sourceId: string;
  action: HomeworkEmailAction;
  audience: HomeworkEmailAudience;
  userId: string;
}

function notificationsEnabled(): boolean {
  return (
    process.env.ACE_HOMEWORK_REVIEWS_ENABLED === "true" &&
    process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED === "true"
  );
}

function notificationIntent(input: HomeworkEmailPayload) {
  return {
    aggregateType: "ACE_HOMEWORK",
    aggregateId: input.sourceId,
    eventType: "ace.homework.email",
    idempotencyKey: `ace-homework-email:${input.action}:${input.sourceId}:${input.recipientId}:${input.audience}:${input.userId}`,
    payload: {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      sourceId: input.sourceId,
      action: input.action,
      audience: input.audience,
      userId: input.userId,
    },
  };
}

export async function enqueueHomeworkEmail(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: HomeworkEmailPayload,
): Promise<void> {
  if (!notificationsEnabled()) return;
  await outbox.enqueue(tx, notificationIntent(input));
}

export async function enqueueAssignmentAudienceEmail(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    assignmentId: string;
    recipients: Array<{ id: string; childId: string }>;
  },
): Promise<void> {
  if (!notificationsEnabled()) return;
  const childIds = input.recipients.map((recipient) => recipient.childId);
  const [students, guardians] = await Promise.all([
    tx.studentIdentityLink.findMany({
      where: { tenantId: input.tenantId, childId: { in: childIds } },
      select: { childId: true, studentIdentity: { select: { userId: true } } },
    }),
    tx.guardianChildRelationship.findMany({
      where: {
        tenantId: input.tenantId,
        childId: { in: childIds },
        legalAccess: "FULL",
        startsAt: { lte: new Date() },
        endedAt: null,
        revokedAt: null,
      },
      select: { childId: true, guardianIdentity: { select: { userId: true } } },
    }),
  ]);
  const studentIds = new Map<string, string[]>();
  const guardianIds = new Map<string, string[]>();
  for (const link of students) {
    const ids = studentIds.get(link.childId) ?? [];
    ids.push(link.studentIdentity.userId);
    studentIds.set(link.childId, ids);
  }
  for (const link of guardians) {
    const ids = guardianIds.get(link.childId) ?? [];
    ids.push(link.guardianIdentity.userId);
    guardianIds.set(link.childId, ids);
  }
  const events = input.recipients.flatMap((recipient) =>
    [...new Set(studentIds.get(recipient.childId) ?? [])]
      .map((userId) =>
        notificationIntent({
          tenantId: input.tenantId,
          recipientId: recipient.id,
          sourceId: input.assignmentId,
          action: "ASSIGNED",
          audience: "STUDENT",
          userId,
        }),
      )
      .concat(
        [...new Set(guardianIds.get(recipient.childId) ?? [])].map((userId) =>
          notificationIntent({
            tenantId: input.tenantId,
            recipientId: recipient.id,
            sourceId: input.assignmentId,
            action: "ASSIGNED",
            audience: "GUARDIAN",
            userId,
          }),
        ),
      ),
  );
  if (events.length)
    await tx.outboxEvent.createMany({ data: events, skipDuplicates: true });
}

export async function enqueueStudentAndGuardianEmail(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: {
    tenantId: string;
    recipientId: string;
    childId: string;
    sourceId: string;
    action: "ASSIGNED" | "RETURNED" | "RELEASED";
  },
): Promise<void> {
  if (!notificationsEnabled()) return;
  const now = new Date();
  const [students, guardians] = await Promise.all([
    tx.studentIdentityLink.findMany({
      where: { tenantId: input.tenantId, childId: input.childId },
      select: { studentIdentity: { select: { userId: true } } },
    }),
    tx.guardianChildRelationship.findMany({
      where: {
        tenantId: input.tenantId,
        childId: input.childId,
        legalAccess: "FULL",
        startsAt: { lte: now },
        endedAt: null,
        revokedAt: null,
      },
      select: { guardianIdentity: { select: { userId: true } } },
    }),
  ]);
  const audience =
    input.action === "RETURNED"
      ? (["STUDENT"] as const)
      : input.action === "RELEASED"
        ? (["GUARDIAN"] as const)
        : (["STUDENT", "GUARDIAN"] as const);
  for (const kind of audience) {
    const ids =
      kind === "STUDENT"
        ? students.map((row) => row.studentIdentity.userId)
        : guardians.map((row) => row.guardianIdentity.userId);
    for (const userId of new Set(ids)) {
      await enqueueHomeworkEmail(tx, outbox, {
        tenantId: input.tenantId,
        recipientId: input.recipientId,
        sourceId: input.sourceId,
        action: input.action,
        audience: kind,
        userId,
      });
    }
  }
}

export async function enqueueStaffSubmissionEmail(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: {
    tenantId: string;
    recipientId: string;
    sourceId: string;
    yearBandId: string;
    today: Date;
  },
): Promise<void> {
  if (!notificationsEnabled()) return;
  const [assigned, leaders] = await Promise.all([
    tx.aceStaffYearBandAssignment.findMany({
      where: {
        tenantId: input.tenantId,
        yearBandId: input.yearBandId,
        startsOn: { lte: input.today },
        OR: [{ endsOn: null }, { endsOn: { gte: input.today } }],
      },
      select: { userId: true },
    }),
    tx.siteMembership.findMany({
      where: { tenantId: input.tenantId, role: "SITE_ADMIN" },
      select: { userId: true },
    }),
  ]);
  for (const userId of new Set(
    [...assigned, ...leaders].map((row) => row.userId),
  )) {
    await enqueueHomeworkEmail(tx, outbox, {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      sourceId: input.sourceId,
      action: "SUBMITTED",
      audience: "STAFF",
      userId,
    });
  }
}
