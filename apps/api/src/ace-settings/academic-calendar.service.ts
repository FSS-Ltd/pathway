import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  isDateOnly,
  type CreateAcademicYearDto,
} from "./dto/academic-calendar.dto";

export interface AcademicCalendarActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export interface AcademicPeriodResponse {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "ACTIVE" | "ARCHIVED";
}

export interface AcademicYearResponse {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "ACTIVE" | "ARCHIVED";
  periods: AcademicPeriodResponse[];
}

export interface AcademicCalendarResponse {
  timezone: string;
  academicYears: AcademicYearResponse[];
}

type AcademicYearRecord = {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  status: "ACTIVE" | "ARCHIVED";
  periods: Array<{
    id: string;
    name: string;
    startsOn: Date;
    endsOn: Date;
    status: "ACTIVE" | "ARCHIVED";
  }>;
};

@Injectable()
export class AcademicCalendarService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService = new OutboxService(),
  ) {}

  async list(actor: AcademicCalendarActor): Promise<AcademicCalendarResponse> {
    this.assertActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await this.requireSite(tx, actor);
      const academicYears = await tx.academicYear.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { startsOn: "desc" },
        select: academicYearSelect,
      });
      return {
        timezone: site.timezone,
        academicYears: academicYears.map((year) =>
          this.toAcademicYearResponse(year),
        ),
      };
    });
  }

  async create(
    command: CreateAcademicYearDto,
    actor: AcademicCalendarActor,
  ): Promise<AcademicYearResponse> {
    this.assertActor(actor);
    this.assertCommand(command);

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.requireSite(tx, actor);
          const academicYear = await tx.academicYear.create({
            data: {
              tenantId: actor.tenantId,
              name: command.name.trim(),
              startsOn: toDatabaseDate(command.startsOn),
              endsOn: toDatabaseDate(command.endsOn),
              status: "ACTIVE",
              periods: {
                create: command.periods.map((period) => ({
                  tenantId: actor.tenantId,
                  name: period.name.trim(),
                  startsOn: toDatabaseDate(period.startsOn),
                  endsOn: toDatabaseDate(period.endsOn),
                  status: "ACTIVE",
                })),
              },
            },
            select: academicYearSelect,
          });

          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: academicYear.id,
            action: AuditAction.CREATED,
            metadata: {
              reason: command.reason.trim(),
              academicYearName: academicYear.name,
              periodCount: command.periods.length,
            },
          });
          await this.outbox.enqueue(tx, {
            aggregateType: "ACADEMIC_YEAR",
            aggregateId: academicYear.id,
            eventType: "ace.academic-year.created",
            payload: { periodCount: command.periods.length },
            idempotencyKey: `ace-academic-year:${academicYear.id}:${randomUUID()}`,
          });

          return this.toAcademicYearResponse(academicYear);
        },
      );
    } catch (error) {
      if (isAcademicCalendarConflict(error)) {
        throw new ConflictException(
          "An active academic year or overlapping period already exists for this site",
        );
      }
      throw error;
    }
  }

  private assertActor(actor: AcademicCalendarActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private assertCommand(command: CreateAcademicYearDto): void {
    if (!command.reason?.trim()) {
      throw new BadRequestException(
        "A reason is required for academic calendar changes",
      );
    }
    if (!command.name?.trim()) {
      throw new BadRequestException("An academic year name is required");
    }
    if (!isDateOnly(command.startsOn) || !isDateOnly(command.endsOn)) {
      throw new BadRequestException("Academic year dates must use YYYY-MM-DD");
    }
    if (command.endsOn < command.startsOn) {
      throw new BadRequestException(
        "An academic year must end on or after its start date",
      );
    }
    if (!Array.isArray(command.periods) || command.periods.length === 0) {
      throw new BadRequestException("At least one academic period is required");
    }

    const periods = [...command.periods].sort((left, right) =>
      left.startsOn.localeCompare(right.startsOn),
    );
    for (const [index, period] of periods.entries()) {
      if (!period.name?.trim()) {
        throw new BadRequestException("Each academic period needs a name");
      }
      if (!isDateOnly(period.startsOn) || !isDateOnly(period.endsOn)) {
        throw new BadRequestException(
          "Academic period dates must use YYYY-MM-DD",
        );
      }
      if (period.endsOn < period.startsOn) {
        throw new BadRequestException(
          "A period must end on or after its start date",
        );
      }
      if (
        period.startsOn < command.startsOn ||
        period.endsOn > command.endsOn
      ) {
        throw new BadRequestException(
          "Each academic period must fall within the academic year",
        );
      }
      const previous = periods[index - 1];
      if (previous && period.startsOn <= previous.endsOn) {
        throw new BadRequestException("Academic periods must not overlap");
      }
    }
  }

  private async requireSite(
    tx: Prisma.TransactionClient,
    actor: AcademicCalendarActor,
  ): Promise<{ timezone: string }> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
    if (!isIanaTimezone(site.timezone)) {
      throw new BadRequestException("The active site has an invalid timezone");
    }
    return { timezone: site.timezone };
  }

  private toAcademicYearResponse(
    year: AcademicYearRecord,
  ): AcademicYearResponse {
    return {
      id: year.id,
      name: year.name,
      startsOn: formatDateOnly(year.startsOn),
      endsOn: formatDateOnly(year.endsOn),
      status: year.status,
      periods: year.periods.map((period) => ({
        id: period.id,
        name: period.name,
        startsOn: formatDateOnly(period.startsOn),
        endsOn: formatDateOnly(period.endsOn),
        status: period.status,
      })),
    };
  }
}

const academicYearSelect = {
  id: true,
  name: true,
  startsOn: true,
  endsOn: true,
  status: true,
  periods: {
    orderBy: { startsOn: "asc" },
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      status: true,
    },
  },
} satisfies Prisma.AcademicYearSelect;

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return [
    value.getUTCFullYear().toString().padStart(4, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function isIanaTimezone(value: string | null): value is string {
  if (!value) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isAcademicCalendarConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  if (error.code === "P2002") return true;
  return (
    error.code === "P2010" &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "code" in error.meta &&
    error.meta.code === "23P01"
  );
}
