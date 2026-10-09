import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import {
  acquireTimetableDraftLock,
  acquireTimetableScheduleReadLock,
  requireEligibleTimetableChild,
  requireTimetableBand,
  requireTimetablePeriod,
  requireTimetableSite,
  requireValidTimetableEntries,
  type TimetableActor,
} from "./ace-subject-timetable.domain";
import { buildTimetableSnapshot } from "./ace-subject-timetable-snapshot";
import type {
  PublishStudentTimetableDto,
  WithdrawStudentTimetableDto,
} from "./dto/ace-subject-timetable.dto";

@Injectable()
export class AceSubjectTimetablePublicationService {
  async get(
    actor: TimetableActor,
    periodId: string,
    childId: string,
    publicationId: string,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const publication = await tx.aceStudentTimetablePublication.findFirst({
        where: {
          id: publicationId,
          tenantId: actor.tenantId,
          childId,
          academicPeriodId: periodId,
          publishedAt: { not: null },
        },
        include: {
          entries: { orderBy: [{ day: "asc" }, { slotPosition: "asc" }] },
        },
      });
      if (!publication)
        throw new NotFoundException("Published timetable not found");
      return publication;
    });
  }

  async publish(
    actor: TimetableActor,
    periodId: string,
    yearBandId: string,
    childId: string,
    command: PublishStudentTimetableDto,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const period = await requireTimetablePeriod(tx, actor.tenantId, periodId);
      const band = await requireTimetableBand(tx, actor.tenantId, yearBandId);
      await acquireTimetableScheduleReadLock(
        tx,
        actor.tenantId,
        periodId,
        yearBandId,
      );
      await acquireTimetableDraftLock(tx, actor.tenantId, periodId, childId);
      await requireEligibleTimetableChild(
        tx,
        actor.tenantId,
        childId,
        period,
        yearBandId,
      );
      const draft = await tx.aceStudentTimetableDraft.findUnique({
        where: {
          tenantId_childId_academicPeriodId: {
            tenantId: actor.tenantId,
            childId,
            academicPeriodId: periodId,
          },
        },
        include: {
          entries: true,
          schedule: { include: { slots: { orderBy: { position: "asc" } } } },
        },
      });
      if (!draft || draft.schedule.yearBandId !== yearBandId) {
        throw new NotFoundException("Student timetable draft not found");
      }
      if (
        draft.version !== command.expectedVersion ||
        draft.schedule.updatedAt.toISOString() !== command.scheduleUpdatedAt
      ) {
        throw new ConflictException(
          "The draft or schedule changed. Reload before publishing",
        );
      }
      const latest = await tx.aceStudentTimetablePublication.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId,
          academicPeriodId: periodId,
          publishedAt: { not: null },
        },
        orderBy: [{ draftVersion: "desc" }, { id: "desc" }],
        select: { draftVersion: true },
      });
      if (latest && latest.draftVersion >= draft.version) {
        throw new ConflictException("This draft version is already published");
      }
      const subjects = await requireValidTimetableEntries(
        tx,
        actor.tenantId,
        childId,
        period,
        draft.schedule,
        draft.entries,
      );
      const snapshot = buildTimetableSnapshot(
        actor.tenantId,
        draft.schedule,
        draft.entries,
        subjects,
      );
      const { unassignedLessonCount } = snapshot;
      if (unassignedLessonCount && !command.acknowledgeUnassigned) {
        throw new BadRequestException(
          `Acknowledge ${unassignedLessonCount} unassigned lesson cells before publishing`,
        );
      }
      const publication = await tx.aceStudentTimetablePublication.create({
        data: {
          tenantId: actor.tenantId,
          draftId: draft.id,
          draftVersion: draft.version,
          childId,
          academicPeriodId: periodId,
          periodName: period.name,
          periodStartsOn: period.startsOn,
          periodEndsOn: period.endsOn,
          yearBandName: band.name,
          publishedByUserId: actor.userId,
        },
      });
      await tx.aceStudentTimetablePublicationEntry.createMany({
        data: snapshot.entries.map((entry) => ({
          ...entry,
          publicationId: publication.id,
        })),
      });
      const issued = await tx.aceStudentTimetablePublication.update({
        where: {
          id_tenantId: { id: publication.id, tenantId: actor.tenantId },
        },
        data: { publishedAt: new Date() },
        include: {
          entries: { orderBy: [{ day: "asc" }, { slotPosition: "asc" }] },
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: issued.id,
        action: AuditAction.CREATED,
        metadata: {
          action: "ace.subject-timetable.publish",
          childId,
          academicPeriodId: periodId,
          draftVersion: draft.version,
          unassignedLessonCount,
          reason: command.reason,
        },
      });
      return { publication: issued, unassignedLessonCount };
    });
  }

  async withdraw(
    actor: TimetableActor,
    periodId: string,
    childId: string,
    command: WithdrawStudentTimetableDto,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      await acquireTimetableDraftLock(tx, actor.tenantId, periodId, childId);
      const latest = await tx.aceStudentTimetablePublication.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId,
          academicPeriodId: periodId,
          publishedAt: { not: null },
        },
        orderBy: [{ draftVersion: "desc" }, { id: "desc" }],
        select: { id: true, withdrawnAt: true },
      });
      if (!latest || latest.id !== command.publicationId) {
        throw new NotFoundException("Published timetable not found");
      }
      if (latest.withdrawnAt) {
        throw new ConflictException("This publication was already withdrawn");
      }
      const publication = await tx.aceStudentTimetablePublication.update({
        where: { id_tenantId: { id: latest.id, tenantId: actor.tenantId } },
        data: {
          withdrawnAt: new Date(),
          withdrawnByUserId: actor.userId,
          withdrawalReason: command.reason,
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: publication.id,
        action: AuditAction.UPDATED,
        metadata: {
          action: "ace.subject-timetable.withdraw",
          childId,
          academicPeriodId: periodId,
          reason: command.reason,
        },
      });
      return publication;
    });
  }
}
