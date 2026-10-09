import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import {
  acquireTimetableScheduleWriteLock,
  requireTimetableBand,
  requireTimetablePeriod,
  requireTimetableSite,
  type TimetableActor,
} from "./ace-subject-timetable.domain";
import type { SaveTimetableScheduleDto } from "./dto/ace-subject-timetable.dto";

const scheduleInclude = {
  slots: { orderBy: { position: "asc" as const } },
} satisfies Prisma.AceTimetableScheduleInclude;

@Injectable()
export class AceSubjectTimetableScheduleService {
  async setup(actor: TimetableActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const [academicYears, yearBands] = await Promise.all([
        tx.academicYear.findMany({
          where: { tenantId: actor.tenantId },
          orderBy: { startsOn: "desc" },
          take: 20,
          select: {
            id: true,
            name: true,
            periods: {
              orderBy: { startsOn: "desc" },
              select: {
                id: true,
                name: true,
                startsOn: true,
                endsOn: true,
              },
            },
          },
        }),
        tx.aceYearBand.findMany({
          where: { tenantId: actor.tenantId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        }),
      ]);
      return { academicYears, yearBands };
    });
  }

  async get(actor: TimetableActor, periodId: string, yearBandId: string) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTimetableSite(tx, actor);
      const [period, band, schedule] = await Promise.all([
        requireTimetablePeriod(tx, actor.tenantId, periodId),
        requireTimetableBand(tx, actor.tenantId, yearBandId),
        tx.aceTimetableSchedule.findUnique({
          where: {
            tenantId_academicPeriodId_yearBandId: {
              tenantId: actor.tenantId,
              academicPeriodId: periodId,
              yearBandId,
            },
          },
          include: scheduleInclude,
        }),
      ]);
      return {
        period: {
          id: period.id,
          name: period.name,
          startsOn: period.startsOn,
          endsOn: period.endsOn,
        },
        yearBand: band,
        schedule,
      };
    });
  }

  async save(
    actor: TimetableActor,
    periodId: string,
    yearBandId: string,
    command: SaveTimetableScheduleDto,
  ) {
    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await requireTimetableSite(tx, actor);
          await Promise.all([
            requireTimetablePeriod(tx, actor.tenantId, periodId),
            requireTimetableBand(tx, actor.tenantId, yearBandId),
          ]);
          await acquireTimetableScheduleWriteLock(
            tx,
            actor.tenantId,
            periodId,
            yearBandId,
          );
          const where = {
            tenantId_academicPeriodId_yearBandId: {
              tenantId: actor.tenantId,
              academicPeriodId: periodId,
              yearBandId,
            },
          };
          const existing = await tx.aceTimetableSchedule.findUnique({
            where,
            include: scheduleInclude,
          });
          if (
            existing
              ? existing.updatedAt.toISOString() !== command.expectedUpdatedAt
              : command.expectedUpdatedAt !== null
          ) {
            throw new ConflictException(
              "The schedule changed. Reload before saving",
            );
          }
          if (!existing && command.slots.some((slot) => slot.id)) {
            throw new BadRequestException(
              "A new schedule cannot reuse slot IDs",
            );
          }

          let scheduleId = existing?.id;
          if (existing) {
            const hasDrafts =
              (await tx.aceStudentTimetableDraft.count({
                where: { tenantId: actor.tenantId, scheduleId: existing.id },
              })) > 0;
            if (hasDrafts) {
              this.assertCompatibleRevision(existing.slots, command);
              const removedDays = existing.teachingDays.filter(
                (day) => !command.teachingDays.includes(day),
              );
              if (
                removedDays.length &&
                (await tx.aceStudentTimetableEntry.count({
                  where: {
                    tenantId: actor.tenantId,
                    scheduleId: existing.id,
                    day: { in: removedDays },
                  },
                })) > 0
              ) {
                throw new ConflictException(
                  "Clear assignments on removed teaching days before editing the schedule",
                );
              }
            } else {
              const knownIds = new Set(existing.slots.map((slot) => slot.id));
              if (
                command.slots.some((slot) => slot.id && !knownIds.has(slot.id))
              ) {
                throw new BadRequestException(
                  "A slot ID belongs to another schedule",
                );
              }
              await tx.aceTimetableSlot.deleteMany({
                where: { tenantId: actor.tenantId, scheduleId: existing.id },
              });
            }
            await tx.aceTimetableSchedule.update({
              where: {
                id_tenantId: { id: existing.id, tenantId: actor.tenantId },
              },
              data: {
                teachingDays: command.teachingDays,
                updatedByUserId: actor.userId,
              },
            });
            if (hasDrafts) {
              for (const [position, slot] of command.slots.entries()) {
                await tx.aceTimetableSlot.update({
                  where: { id: existing.slots[position].id },
                  data: {
                    position,
                    kind: slot.kind,
                    label: slot.label,
                    startMinutes: slot.startMinutes,
                    endMinutes: slot.endMinutes,
                  },
                });
              }
            }
            if (!hasDrafts) {
              await this.createSlots(tx, actor.tenantId, existing.id, command);
            }
          } else {
            const schedule = await tx.aceTimetableSchedule.create({
              data: {
                tenantId: actor.tenantId,
                academicPeriodId: periodId,
                yearBandId,
                teachingDays: command.teachingDays,
                updatedByUserId: actor.userId,
              },
            });
            scheduleId = schedule.id;
            await this.createSlots(tx, actor.tenantId, schedule.id, command);
          }
          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: scheduleId,
            action: existing ? AuditAction.UPDATED : AuditAction.CREATED,
            metadata: {
              action: "ace.subject-timetable.schedule.save",
              academicPeriodId: periodId,
              yearBandId,
              reason: command.reason,
            },
          });
          return tx.aceTimetableSchedule.findUniqueOrThrow({
            where,
            include: scheduleInclude,
          });
        },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        throw new ConflictException(
          "The schedule changed. Reload before saving",
        );
      }
      throw error;
    }
  }

  private assertCompatibleRevision(
    current: ReadonlyArray<{ id: string; kind: "LESSON" | "BREAK" }>,
    command: SaveTimetableScheduleDto,
  ): void {
    if (
      current.length !== command.slots.length ||
      current.some(
        (slot, index) =>
          slot.id !== command.slots[index].id ||
          slot.kind !== command.slots[index].kind,
      )
    ) {
      throw new ConflictException(
        "Slot identity cannot change while student drafts use this schedule",
      );
    }
  }

  private async createSlots(
    tx: Prisma.TransactionClient,
    tenantId: string,
    scheduleId: string,
    command: SaveTimetableScheduleDto,
  ): Promise<void> {
    await tx.aceTimetableSlot.createMany({
      data: command.slots.map((slot, position) => ({
        id: slot.id ?? randomUUID(),
        tenantId,
        scheduleId,
        position,
        kind: slot.kind,
        label: slot.label,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        updatedAt: new Date(),
      })),
    });
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
