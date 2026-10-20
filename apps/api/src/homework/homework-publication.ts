import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { OutboxService } from "../common/outbox/outbox.service";
import {
  assertHomeworkActor,
  requireStaffAccess,
  validateAssignmentInput,
  type HomeworkActor,
} from "./homework-access";
import type { PublishHomeworkDto } from "./dto/publish-homework.dto";
import { assignmentSelect } from "./homework-record";
import {
  audienceFingerprint,
  resolveHomeworkAudience,
} from "./homework-audience";

export async function publishHomeworkWithMode(
  id: string,
  input: PublishHomeworkDto,
  actor: HomeworkActor,
  mode: "immediate" | "scheduled",
  outbox: OutboxService,
) {
  assertHomeworkActor(actor);
  if (process.env.ACE_HOMEWORK_PUBLICATION_ENABLED !== "true") {
    throw new ServiceUnavailableException(
      "Homework publication is not enabled",
    );
  }
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "AceHomeworkAssignment"
      WHERE "id" = ${id} AND "tenantId" = ${actor.tenantId}
      FOR UPDATE
    `;
    const assignment = await tx.aceHomeworkAssignment.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!assignment) {
      throw new NotFoundException("Homework assignment not found");
    }
    const now = new Date();
    const { today } = await requireStaffAccess(
      tx,
      actor,
      assignment.yearBandId,
      now,
    );
    if (assignment.status === "PUBLISHED") {
      const recipientCount = await tx.aceHomeworkRecipient.count({
        where: { tenantId: actor.tenantId, assignmentId: id },
      });
      return { ...assignment, recipientCount };
    }
    const expectedStatus = mode === "scheduled" ? "SCHEDULED" : "DRAFT";
    if (
      assignment.status !== expectedStatus ||
      assignment.version !== input.version ||
      (mode === "scheduled" &&
        (!assignment.scheduledAt ||
          assignment.scheduledAt > new Date() ||
          assignment.scheduledByUserId !== actor.userId))
    ) {
      throw new ConflictException("Homework draft changed before publication");
    }
    await validateAssignmentInput(
      tx,
      {
        title: assignment.title,
        instructions: assignment.instructions,
        academicYearId: assignment.academicYearId,
        yearBandId: assignment.yearBandId,
        subjectId: assignment.subjectId,
        dueAt: assignment.dueAt.toISOString(),
      },
      actor,
    );
    const audience = await resolveHomeworkAudience(
      tx,
      actor,
      assignment.academicYearId,
      assignment.yearBandId,
      today,
    );
    if (audience.size === 0) {
      throw new ConflictException("No current pupils in this class");
    }
    if (
      mode === "scheduled" &&
      assignment.scheduledAudienceHash !== audienceFingerprint(audience)
    ) {
      throw new ConflictException("Class roster changed before publication");
    }
    await tx.aceHomeworkRecipient.createMany({
      data: [...audience].map(([childId, enrollmentId]) => ({
        tenantId: actor.tenantId,
        assignmentId: id,
        childId,
        enrollmentId,
        publishedAt: now,
      })),
    });
    const published = await tx.aceHomeworkAssignment.update({
      where: {
        id_tenantId: { id, tenantId: actor.tenantId },
        status: expectedStatus,
        version: input.version,
      },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        version: { increment: 1 },
      },
      select: assignmentSelect,
    });
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      entityType: AuditEntityType.ACE_RECORD,
      entityId: id,
      action: AuditAction.UPDATED,
      metadata: {
        kind: "homework_assignment",
        status: "PUBLISHED",
        recipientCount: audience.size,
      },
    });
    await outbox.enqueue(tx, {
      aggregateType: "ace.homework.assignment",
      aggregateId: id,
      eventType: "ace.homework.assignment.published",
      idempotencyKey: `ace-homework:${id}:published`,
      payload: {
        tenantId: actor.tenantId,
        assignmentId: id,
        recipientCount: audience.size,
      },
    });
    return { ...published, recipientCount: audience.size };
  });
}
