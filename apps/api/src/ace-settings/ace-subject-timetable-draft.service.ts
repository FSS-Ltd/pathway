import {
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
import type {
  SaveStudentTimetableDraftDto,
  TimetableRosterQueryDto,
} from "./dto/ace-subject-timetable.dto";

@Injectable()
export class AceSubjectTimetableDraftService {
  async roster(
    actor: TimetableActor,
    periodId: string,
    yearBandId: string,
    query: TimetableRosterQueryDto,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const period = await requireTimetablePeriod(tx, actor.tenantId, periodId);
      await requireTimetableBand(tx, actor.tenantId, yearBandId);
      const children = await tx.child.findMany({
        where: {
          tenantId: actor.tenantId,
          isGuest: false,
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
          aceSchoolEnrollments: {
            some: {
              tenantId: actor.tenantId,
              academicYearId: period.academicYearId,
              yearBandId,
              startsOn: { lte: period.endsOn },
              OR: [{ endsOn: null }, { endsOn: { gte: period.startsOn } }],
            },
          },
        },
        orderBy: { id: "asc" },
        take: query.limit + 1,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          aceStudentTimetableDrafts: {
            where: { tenantId: actor.tenantId, academicPeriodId: periodId },
            select: { id: true, version: true },
            take: 1,
          },
          aceStudentTimetablePublications: {
            where: {
              tenantId: actor.tenantId,
              academicPeriodId: periodId,
              publishedAt: { not: null },
            },
            orderBy: [{ draftVersion: "desc" }, { id: "desc" }],
            select: { id: true, publishedAt: true, withdrawnAt: true },
            take: 1,
          },
        },
      });
      const page = children.slice(0, query.limit);
      return {
        items: page.map((child) => {
          const latest = child.aceStudentTimetablePublications[0];
          const draft = child.aceStudentTimetableDrafts[0];
          return {
            id: child.id,
            firstName: child.firstName,
            lastName: child.lastName,
            status:
              latest && !latest.withdrawnAt
                ? "PUBLISHED"
                : draft
                  ? "DRAFT"
                  : "NOT_STARTED",
            draftVersion: draft?.version ?? null,
            publicationId: latest && !latest.withdrawnAt ? latest.id : null,
            publishedAt:
              latest && !latest.withdrawnAt ? latest.publishedAt : null,
          };
        }),
        nextCursor:
          children.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async get(
    actor: TimetableActor,
    periodId: string,
    yearBandId: string,
    childId: string,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const period = await requireTimetablePeriod(tx, actor.tenantId, periodId);
      await requireTimetableBand(tx, actor.tenantId, yearBandId);
      await requireEligibleTimetableChild(
        tx,
        actor.tenantId,
        childId,
        period,
        yearBandId,
      );
      const schedule = await tx.aceTimetableSchedule.findUnique({
        where: {
          tenantId_academicPeriodId_yearBandId: {
            tenantId: actor.tenantId,
            academicPeriodId: periodId,
            yearBandId,
          },
        },
        include: { slots: { orderBy: { position: "asc" } } },
      });
      const draft = await tx.aceStudentTimetableDraft.findUnique({
        where: {
          tenantId_childId_academicPeriodId: {
            tenantId: actor.tenantId,
            childId,
            academicPeriodId: periodId,
          },
        },
        include: { entries: true },
      });
      if (draft && draft.scheduleId !== schedule?.id) {
        throw new ConflictException("The draft uses a different schedule");
      }
      const publications = await tx.aceStudentTimetablePublication.findMany({
        where: {
          tenantId: actor.tenantId,
          childId,
          academicPeriodId: periodId,
          publishedAt: { not: null },
        },
        orderBy: [{ draftVersion: "desc" }, { id: "desc" }],
        take: 20,
        select: { id: true, publishedAt: true, withdrawnAt: true },
      });
      return { schedule, draft, publications };
    });
  }

  async save(
    actor: TimetableActor,
    periodId: string,
    yearBandId: string,
    childId: string,
    command: SaveStudentTimetableDraftDto,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const period = await requireTimetablePeriod(tx, actor.tenantId, periodId);
      await requireTimetableBand(tx, actor.tenantId, yearBandId);
      await requireEligibleTimetableChild(
        tx,
        actor.tenantId,
        childId,
        period,
        yearBandId,
      );
      await acquireTimetableScheduleReadLock(
        tx,
        actor.tenantId,
        periodId,
        yearBandId,
      );
      await acquireTimetableDraftLock(tx, actor.tenantId, periodId, childId);
      const schedule = await tx.aceTimetableSchedule.findFirst({
        where: {
          id: command.scheduleId,
          tenantId: actor.tenantId,
          academicPeriodId: periodId,
          yearBandId,
        },
        include: { slots: true },
      });
      if (!schedule)
        throw new NotFoundException("Timetable schedule not found");
      if (schedule.updatedAt.toISOString() !== command.scheduleUpdatedAt) {
        throw new ConflictException(
          "The schedule changed. Reload before saving",
        );
      }
      await requireValidTimetableEntries(
        tx,
        actor.tenantId,
        childId,
        period,
        schedule,
        command.entries,
      );
      const where = {
        tenantId_childId_academicPeriodId: {
          tenantId: actor.tenantId,
          childId,
          academicPeriodId: periodId,
        },
      };
      const existing = await tx.aceStudentTimetableDraft.findUnique({ where });
      if ((existing?.version ?? 0) !== command.expectedVersion) {
        throw new ConflictException("The draft changed. Reload before saving");
      }
      if (existing && existing.scheduleId !== schedule.id) {
        throw new ConflictException("The draft uses a different schedule");
      }
      const draft = existing
        ? await tx.aceStudentTimetableDraft.update({
            where: { id: existing.id },
            data: {
              version: { increment: 1 },
              updatedByUserId: actor.userId,
            },
          })
        : await tx.aceStudentTimetableDraft.create({
            data: {
              tenantId: actor.tenantId,
              childId,
              academicPeriodId: periodId,
              scheduleId: schedule.id,
              updatedByUserId: actor.userId,
            },
          });
      await tx.aceStudentTimetableEntry.deleteMany({
        where: { tenantId: actor.tenantId, draftId: draft.id },
      });
      if (command.entries.length) {
        await tx.aceStudentTimetableEntry.createMany({
          data: command.entries.map((entry) => ({
            tenantId: actor.tenantId,
            draftId: draft.id,
            scheduleId: schedule.id,
            ...entry,
            updatedAt: new Date(),
          })),
        });
      }
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: draft.id,
        action: existing ? AuditAction.UPDATED : AuditAction.CREATED,
        metadata: {
          action: "ace.subject-timetable.draft.save",
          childId,
          academicPeriodId: periodId,
          version: draft.version,
          entryCount: command.entries.length,
          reason: command.reason,
        },
      });
      return tx.aceStudentTimetableDraft.findUniqueOrThrow({
        where: { id: draft.id },
        include: { entries: true },
      });
    });
  }
}
