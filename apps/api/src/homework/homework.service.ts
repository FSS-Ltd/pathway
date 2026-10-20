import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type {
  CreateHomeworkDto,
  UpdateHomeworkDto,
} from "./dto/create-homework.dto";
import type {
  CancelHomeworkDto,
  PublishHomeworkDto,
  ScheduleHomeworkDto,
} from "./dto/publish-homework.dto";

import {
  assertHomeworkActor,
  requireStaffAccess,
  validateAssignmentInput,
  type HomeworkActor,
} from "./homework-access";
import { publishHomeworkWithMode } from "./homework-publication";
import { assignmentSelect } from "./homework-record";
import {
  audienceFingerprint,
  resolveHomeworkAudience,
} from "./homework-audience";
export type { HomeworkActor } from "./homework-access";

@Injectable()
export class HomeworkService {
  constructor(@Inject(OutboxService) private readonly outbox: OutboxService) {}

  async options(actor: HomeworkActor) {
    assertHomeworkActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const { leader, today } = await requireStaffAccess(tx, actor);
      const [academicYears, yearBands, subjects, assignments] =
        await Promise.all([
          tx.academicYear.findMany({
            where: { tenantId: actor.tenantId, status: "ACTIVE" },
            select: { id: true, name: true, startsOn: true, endsOn: true },
            orderBy: { startsOn: "desc" },
          }),
          tx.aceYearBand.findMany({
            where: { tenantId: actor.tenantId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          tx.subject.findMany({
            where: { tenantId: actor.tenantId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          leader
            ? Promise.resolve([])
            : tx.aceStaffYearBandAssignment.findMany({
                where: {
                  tenantId: actor.tenantId,
                  userId: actor.userId,
                  startsOn: { lte: today },
                  OR: [{ endsOn: null }, { endsOn: { gte: today } }],
                },
                select: { yearBandId: true },
              }),
        ]);
      const allowed = new Set(assignments.map((row) => row.yearBandId));
      return {
        academicYears,
        yearBands: leader
          ? yearBands
          : yearBands.filter((row) => allowed.has(row.id)),
        subjects,
        publicationEnabled:
          process.env.ACE_HOMEWORK_PUBLICATION_ENABLED === "true",
      };
    });
  }

  async list(actor: HomeworkActor) {
    assertHomeworkActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const { leader, today } = await requireStaffAccess(tx, actor);
      const assignments = leader
        ? []
        : await tx.aceStaffYearBandAssignment.findMany({
            where: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              startsOn: { lte: today },
              OR: [{ endsOn: null }, { endsOn: { gte: today } }],
            },
            select: { yearBandId: true },
          });
      return tx.aceHomeworkAssignment.findMany({
        where: {
          tenantId: actor.tenantId,
          ...(leader
            ? {}
            : { yearBandId: { in: assignments.map((row) => row.yearBandId) } }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: assignmentSelect,
      });
    });
  }

  async create(input: CreateHomeworkDto, actor: HomeworkActor) {
    assertHomeworkActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireStaffAccess(tx, actor, input.yearBandId);
      const dueAt = await validateAssignmentInput(tx, input, actor);

      const assignment = await tx.aceHomeworkAssignment.create({
        data: {
          tenantId: actor.tenantId,
          academicYearId: input.academicYearId,
          yearBandId: input.yearBandId,
          subjectId: input.subjectId,
          createdByUserId: actor.userId,
          title: input.title,
          instructions: input.instructions,
          dueAt,
        },
        select: assignmentSelect,
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: assignment.id,
        action: AuditAction.CREATED,
        metadata: { kind: "homework_assignment", status: "DRAFT" },
      });
      return assignment;
    });
  }

  async update(id: string, input: UpdateHomeworkDto, actor: HomeworkActor) {
    assertHomeworkActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireStaffAccess(tx, actor, input.yearBandId);
      const existing = await tx.aceHomeworkAssignment.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { id: true, status: true, version: true, yearBandId: true },
      });
      if (!existing)
        throw new NotFoundException("Homework assignment not found");
      await requireStaffAccess(tx, actor, existing.yearBandId);
      if (
        !["DRAFT", "NEEDS_REVIEW"].includes(existing.status) ||
        existing.version !== input.version
      ) {
        throw new ConflictException(
          "Homework draft changed before it could be edited",
        );
      }
      const dueAt = await validateAssignmentInput(tx, input, actor);
      const updated = await tx.aceHomeworkAssignment.update({
        where: {
          id_tenantId: { id, tenantId: actor.tenantId },
          status: existing.status,
          version: input.version,
        },
        data: {
          title: input.title,
          instructions: input.instructions,
          academicYearId: input.academicYearId,
          yearBandId: input.yearBandId,
          subjectId: input.subjectId,
          dueAt,
          status: "DRAFT",
          scheduledAt: null,
          scheduledAudienceHash: null,
          scheduledByUserId: null,
          scheduleFailureReason: null,
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
        metadata: { kind: "homework_assignment", version: updated.version },
      });
      return updated;
    });
  }

  async publish(id: string, input: PublishHomeworkDto, actor: HomeworkActor) {
    return publishHomeworkWithMode(id, input, actor, "immediate", this.outbox);
  }

  async publishScheduled(
    id: string,
    input: PublishHomeworkDto,
    actor: HomeworkActor,
  ) {
    return publishHomeworkWithMode(id, input, actor, "scheduled", this.outbox);
  }

  async schedule(id: string, input: ScheduleHomeworkDto, actor: HomeworkActor) {
    assertHomeworkActor(actor);
    if (process.env.ACE_HOMEWORK_PUBLICATION_ENABLED !== "true") {
      throw new ServiceUnavailableException(
        "Homework publication is not enabled",
      );
    }
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const assignment = await tx.aceHomeworkAssignment.findFirst({
        where: { id, tenantId: actor.tenantId },
      });
      if (!assignment)
        throw new NotFoundException("Homework assignment not found");
      const now = new Date();
      const { today } = await requireStaffAccess(
        tx,
        actor,
        assignment.yearBandId,
        now,
      );
      if (
        !["DRAFT", "NEEDS_REVIEW"].includes(assignment.status) ||
        assignment.version !== input.version
      ) {
        throw new ConflictException("Homework draft changed before scheduling");
      }
      const scheduledAt = new Date(input.scheduledAt);
      if (scheduledAt <= now || scheduledAt >= assignment.dueAt) {
        throw new BadRequestException(
          "Schedule before the due date and in the future",
        );
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
      const scheduled = await tx.aceHomeworkAssignment.update({
        where: {
          id_tenantId: { id, tenantId: actor.tenantId },
          version: input.version,
        },
        data: {
          status: "SCHEDULED",
          scheduledAt,
          scheduledAudienceHash: audienceFingerprint(audience),
          scheduledByUserId: actor.userId,
          scheduleFailureReason: null,
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
        metadata: { kind: "homework_assignment", status: "SCHEDULED" },
      });
      return scheduled;
    });
  }

  async cancel(id: string, input: CancelHomeworkDto, actor: HomeworkActor) {
    assertHomeworkActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "AceHomeworkAssignment"
        WHERE "id" = ${id} AND "tenantId" = ${actor.tenantId}
        FOR UPDATE
      `;
      const assignment = await tx.aceHomeworkAssignment.findFirst({
        where: { id, tenantId: actor.tenantId },
      });
      if (!assignment)
        throw new NotFoundException("Homework assignment not found");
      await requireStaffAccess(tx, actor, assignment.yearBandId);
      if (assignment.status === "CANCELLED") return assignment;
      if (assignment.version !== input.version) {
        throw new ConflictException(
          "Homework assignment changed before cancellation",
        );
      }
      const cancelled = await tx.aceHomeworkAssignment.update({
        where: {
          id_tenantId: { id, tenantId: actor.tenantId },
          version: input.version,
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
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
          status: "CANCELLED",
          reason: input.reason,
        },
      });
      return cancelled;
    });
  }

  async markScheduleNeedsReview(
    id: string,
    version: number,
    reason: "PUBLISHER_ACCESS_CHANGED" | "PUBLICATION_INPUT_CHANGED",
    actor: HomeworkActor,
  ): Promise<boolean> {
    assertHomeworkActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const updated = await tx.aceHomeworkAssignment.updateMany({
        where: {
          id,
          tenantId: actor.tenantId,
          status: "SCHEDULED",
          version,
        },
        data: {
          status: "NEEDS_REVIEW",
          scheduleFailureReason: reason,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) return false;
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: id,
        action: AuditAction.UPDATED,
        metadata: {
          kind: "homework_assignment",
          status: "NEEDS_REVIEW",
          reason,
        },
      });
      return true;
    });
  }
}
