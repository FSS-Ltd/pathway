import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type {
  SaveSchoolVolunteering,
  StaffVolunteeringRange,
} from "./dto/school-volunteering.dto";
import { RotaAccessService, type RotaActor } from "./rota-access.service";
import {
  SCHOOL_VOLUNTEER_CAPACITY,
  dateFromKey,
  dateKey,
  occupiedVolunteerSlots,
  requireAceVolunteerSite,
  requireVolunteerGuardian,
  requireVolunteerSite,
  setVolunteerActor,
  todayAtSite,
} from "./school-volunteering-access";

@Injectable()
export class SchoolVolunteeringService {
  constructor(
    @Inject(RotaAccessService) private readonly rotaAccess: RotaAccessService,
  ) {}

  async parentCalendar(siteId: string, userId: string) {
    const site = await requireVolunteerSite(siteId);
    const today = todayAtSite(site.timezone);
    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      await setVolunteerActor(tx, userId);
      const guardianId = await requireVolunteerGuardian(tx, siteId, userId);
      const periods = await tx.academicPeriod.findMany({
        where: {
          tenantId: siteId,
          status: "ACTIVE",
          endsOn: { gte: dateFromKey(today) },
          academicYear: { status: "ACTIVE" },
        },
        select: {
          id: true,
          name: true,
          startsOn: true,
          endsOn: true,
          academicYearId: true,
        },
        orderBy: { startsOn: "asc" },
        take: 12,
      });
      const items = [];
      for (const period of periods) {
        const [openDays, selected, occupied] = await Promise.all([
          tx.aceTeachingDate.findMany({
            where: {
              tenantId: siteId,
              academicYearId: period.academicYearId,
              date: {
                gte:
                  dateFromKey(today) > period.startsOn
                    ? dateFromKey(today)
                    : period.startsOn,
                lte: period.endsOn,
              },
              kind: { in: ["TEACHING", "EXCEPTIONAL_OPEN"] },
            },
            select: { date: true },
            orderBy: { date: "asc" },
            take: 366,
          }),
          tx.aceSchoolVolunteerReservation.findMany({
            where: {
              tenantId: siteId,
              academicPeriodId: period.id,
              guardianIdentityId: guardianId,
              cancelledAt: null,
            },
            select: { date: true },
          }),
          occupiedVolunteerSlots(tx, siteId, period.id),
        ]);
        const selectedDates = new Set(selected.map((row) => dateKey(row.date)));
        items.push({
          id: period.id,
          name: period.name,
          startsOn: dateKey(period.startsOn),
          endsOn: dateKey(period.endsOn),
          days: openDays.map(({ date }) => {
            const key = dateKey(date);
            const isSelected = selectedDates.has(key);
            const spacesLeft =
              SCHOOL_VOLUNTEER_CAPACITY - (occupied.get(key)?.size ?? 0);
            return {
              date: key,
              status: isSelected
                ? ("Selected" as const)
                : spacesLeft > 0
                  ? ("Available" as const)
                  : ("Full" as const),
              spacesLeft,
            };
          }),
        });
      }
      return { siteId, capacity: SCHOOL_VOLUNTEER_CAPACITY, periods: items };
    });
  }

  async saveParentChoices(
    siteId: string,
    periodId: string,
    userId: string,
    input: SaveSchoolVolunteering,
  ) {
    const site = await requireVolunteerSite(siteId);
    const today = todayAtSite(site.timezone);
    try {
      return await withTenantRlsContext(siteId, site.orgId, async (tx) => {
        await setVolunteerActor(tx, userId);
        // A single site/period lock makes the capacity check and slot allocation atomic.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${siteId + ":" + periodId}, 0))`;
        const guardianId = await requireVolunteerGuardian(tx, siteId, userId);
        const period = await tx.academicPeriod.findFirst({
          where: {
            id: periodId,
            tenantId: siteId,
            status: "ACTIVE",
            academicYear: { status: "ACTIVE" },
          },
          select: { startsOn: true, endsOn: true, academicYearId: true },
        });
        if (!period)
          throw new NotFoundException("School volunteering period not found");

        const desired = new Set(input.dates);
        const openDays = await tx.aceTeachingDate.findMany({
          where: {
            tenantId: siteId,
            academicYearId: period.academicYearId,
            date: {
              gte:
                dateFromKey(today) > period.startsOn
                  ? dateFromKey(today)
                  : period.startsOn,
              lte: period.endsOn,
            },
            kind: { in: ["TEACHING", "EXCEPTIONAL_OPEN"] },
          },
          select: { date: true },
        });
        const validDates = new Set(openDays.map(({ date }) => dateKey(date)));
        if ([...desired].some((date) => !validDates.has(date))) {
          throw new ConflictException(
            "A selected day is no longer open. Refresh the calendar.",
          );
        }

        const current = await tx.aceSchoolVolunteerReservation.findMany({
          where: {
            tenantId: siteId,
            academicPeriodId: periodId,
            guardianIdentityId: guardianId,
            date: { gte: dateFromKey(today) },
            cancelledAt: null,
          },
          select: { id: true, date: true },
        });
        const currentDates = new Set(current.map(({ date }) => dateKey(date)));
        let removed = 0;
        for (const row of current) {
          if (desired.has(dateKey(row.date))) continue;
          await tx.aceSchoolVolunteerReservation.update({
            where: { id: row.id },
            data: {
              cancelledAt: new Date(),
              cancelledByUserId: userId,
              cancellationReason: "Removed by parent",
            },
          });
          await this.audit(
            tx,
            siteId,
            site.orgId,
            userId,
            row.id,
            AuditAction.UPDATED,
            "removed_by_parent",
          );
          removed += 1;
        }

        const occupied = await occupiedVolunteerSlots(tx, siteId, periodId);
        let added = 0;
        for (const date of [...desired].sort()) {
          if (currentDates.has(date)) continue;
          const slots = occupied.get(date) ?? new Set<number>();
          const slot = [1, 2].find((candidate) => !slots.has(candidate));
          if (!slot)
            throw new ConflictException(
              "A selected day just filled. Refresh the calendar.",
            );
          const reservation = await tx.aceSchoolVolunteerReservation.create({
            data: {
              tenantId: siteId,
              guardianIdentityId: guardianId,
              academicPeriodId: periodId,
              date: dateFromKey(date),
              slot,
            },
            select: { id: true },
          });
          await this.audit(
            tx,
            siteId,
            site.orgId,
            userId,
            reservation.id,
            AuditAction.CREATED,
            "selected_by_parent",
          );
          slots.add(slot);
          occupied.set(date, slots);
          added += 1;
        }
        return { added, removed };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "A selected day just filled. Refresh the calendar.",
        );
      }
      throw error;
    }
  }

  async staffRota(actor: RotaActor, range: StaffVolunteeringRange) {
    await this.rotaAccess.assertTeamViewer(actor);
    await requireAceVolunteerSite(actor.tenantId);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await setVolunteerActor(tx, actor.userId);
      await tx.$executeRaw`SELECT set_config('app.ace_volunteer_staff_view', 'on', true)`;
      const periods = await tx.academicPeriod.findMany({
        where: {
          tenantId: actor.tenantId,
          status: "ACTIVE",
          startsOn: { lte: dateFromKey(range.to) },
          endsOn: { gte: dateFromKey(range.from) },
        },
        select: { academicYearId: true },
      });
      const yearIds = [
        ...new Set(periods.map(({ academicYearId }) => academicYearId)),
      ];
      const [days, reservations] = await Promise.all([
        tx.aceTeachingDate.findMany({
          where: {
            tenantId: actor.tenantId,
            academicYearId: { in: yearIds },
            date: { gte: dateFromKey(range.from), lte: dateFromKey(range.to) },
            kind: { in: ["TEACHING", "EXCEPTIONAL_OPEN"] },
          },
          select: { date: true },
          orderBy: { date: "asc" },
        }),
        tx.aceSchoolVolunteerReservation.findMany({
          where: {
            tenantId: actor.tenantId,
            date: { gte: dateFromKey(range.from), lte: dateFromKey(range.to) },
            cancelledAt: null,
          },
          select: {
            id: true,
            date: true,
            guardianIdentity: {
              select: {
                user: {
                  select: {
                    name: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: [{ date: "asc" }, { slot: "asc" }],
        }),
      ]);
      return {
        siteId: actor.tenantId,
        capacity: SCHOOL_VOLUNTEER_CAPACITY,
        canManage: await this.rotaAccess.canManage(actor),
        days: days.map(({ date }) => {
          const key = dateKey(date);
          return {
            date: key,
            volunteers: reservations
              .filter((row) => dateKey(row.date) === key)
              .map((row) => {
                const user = row.guardianIdentity.user;
                return {
                  id: row.id,
                  name:
                    user.displayName ||
                    user.name ||
                    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                    "Parent volunteer",
                };
              }),
          };
        }),
      };
    });
  }

  async cancelByManager(
    actor: RotaActor,
    reservationId: string,
    reason: string,
  ) {
    await this.rotaAccess.assertManager(actor);
    await requireAceVolunteerSite(actor.tenantId);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await setVolunteerActor(tx, actor.userId);
      await tx.$executeRaw`SELECT set_config('app.ace_volunteer_staff_view', 'on', true)`;
      await tx.$executeRaw`SELECT set_config('app.ace_volunteer_manager', 'on', true)`;
      const reservation = await tx.aceSchoolVolunteerReservation.findFirst({
        where: {
          id: reservationId,
          tenantId: actor.tenantId,
          cancelledAt: null,
        },
        select: { id: true },
      });
      if (!reservation) throw new NotFoundException("Reservation not found");
      await tx.aceSchoolVolunteerReservation.update({
        where: { id: reservation.id },
        data: {
          cancelledAt: new Date(),
          cancelledByUserId: actor.userId,
          cancellationReason: reason,
        },
      });
      await this.audit(
        tx,
        actor.tenantId,
        actor.orgId,
        actor.userId,
        reservation.id,
        AuditAction.UPDATED,
        "cancelled_by_manager",
        reason,
      );
      return { cancelled: true };
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    siteId: string,
    orgId: string,
    actorUserId: string,
    reservationId: string,
    action: AuditAction,
    event: string,
    reason?: string,
  ): Promise<void> {
    await recordAuditEventInTransaction(tx, {
      tenantId: siteId,
      orgId,
      actorUserId,
      entityType: AuditEntityType.ACE_RECORD,
      entityId: reservationId,
      action,
      metadata: {
        recordType: "AceSchoolVolunteerReservation",
        event,
        ...(reason ? { reason } : {}),
      },
    });
  }
}
