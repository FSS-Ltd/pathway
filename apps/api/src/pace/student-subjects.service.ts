import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { parsePaceNumber } from "@pathway/ace-domain";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  assessmentSelect,
  rebuildProgressRecord,
  type AssessmentRecord,
} from "./pace-command.support";
import {
  isDateOnly,
  type CreateStudentSubjectDto,
} from "./dto/student-subject.dto";

export interface StudentSubjectsActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export interface StudentSubjectPlacementResponse {
  id: string;
  subjectId: string;
  subjectName: string;
  startsOn: string;
  endsOn: string | null;
  status: "ACTIVE";
  startingPace: number;
  currentPace: number;
  targetPace: number;
}

export interface StudentSubjectOptionResponse {
  id: string;
  name: string;
}

export interface StudentSubjectsResponse {
  placements: StudentSubjectPlacementResponse[];
  subjects: StudentSubjectOptionResponse[];
}

type StudentSubjectEnrollmentRecord = {
  id: string;
  startsOn: Date;
  endsOn: Date | null;
  status: "ACTIVE" | "ENDED";
  startingPace: number;
  currentPace: number;
  targetPace: number;
  subject: StudentSubjectOptionResponse;
};

@Injectable()
export class StudentSubjectsService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService = new OutboxService(),
  ) {}

  async list(
    childId: string,
    actor: StudentSubjectsActor,
  ): Promise<StudentSubjectsResponse> {
    this.assertActor(actor);
    this.assertChildId(childId);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireSiteAndChild(tx, childId, actor);
      const [placements, subjects] = await Promise.all([
        tx.studentSubjectEnrollment.findMany({
          where: { tenantId: actor.tenantId, childId, status: "ACTIVE" },
          orderBy: [{ subject: { name: "asc" } }, { startsOn: "asc" }],
          select: studentSubjectEnrollmentSelect,
        }),
        tx.subject.findMany({
          where: { tenantId: actor.tenantId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        }),
      ]);
      return {
        placements: placements.map((placement) => this.toResponse(placement)),
        subjects,
      };
    });
  }

  async place(
    childId: string,
    command: CreateStudentSubjectDto,
    actor: StudentSubjectsActor,
  ): Promise<StudentSubjectPlacementResponse> {
    this.assertActor(actor);
    this.assertChildId(childId);
    this.assertCommand(command);

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.requireSiteAndChild(tx, childId, actor);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ace-pace-assessment:${actor.tenantId}:${childId}`}, 0))`;
          const subject = await tx.subject.findFirst({
            where: {
              id: command.subjectId,
              tenantId: actor.tenantId,
              isActive: true,
            },
            select: { id: true, name: true },
          });
          if (!subject) throw new NotFoundException("Active subject not found");

          const replacement = command.replacesEnrollmentId
            ? await tx.studentSubjectEnrollment.findFirst({
                where: {
                  id: command.replacesEnrollmentId,
                  tenantId: actor.tenantId,
                  childId,
                  subjectId: subject.id,
                  status: "ACTIVE",
                },
                select: { id: true, startsOn: true },
              })
            : null;

          if (command.replacesEnrollmentId) {
            if (!replacement)
              throw new NotFoundException("Active placement not found");
            if (command.startsOn <= formatDateOnly(replacement.startsOn)) {
              throw new BadRequestException(
                "A revised placement must start after the active placement",
              );
            }
            const ended = await tx.studentSubjectEnrollment.updateMany({
              where: {
                id: replacement.id,
                tenantId: actor.tenantId,
                childId,
                subjectId: subject.id,
                status: "ACTIVE",
              },
              data: {
                status: "ENDED",
                endsOn: toDatabaseDate(previousDate(command.startsOn)),
              },
            });
            if (ended.count !== 1)
              throw new ConflictException(
                "The active placement changed before it could be revised",
              );
          } else {
            const existing = await tx.studentSubjectEnrollment.findFirst({
              where: {
                tenantId: actor.tenantId,
                childId,
                subjectId: subject.id,
                status: "ACTIVE",
              },
              select: { id: true },
            });
            if (existing)
              throw new ConflictException(
                "This student already has an active placement for this subject",
              );
          }

          const enrollment = await tx.studentSubjectEnrollment.create({
            data: {
              tenantId: actor.tenantId,
              childId,
              subjectId: subject.id,
              startsOn: toDatabaseDate(command.startsOn),
              status: "ACTIVE",
              startingPace: command.startingPace,
              currentPace: command.currentPace,
              targetPace: command.targetPace,
              recordedByUserId: actor.userId,
              reason: command.reason.trim(),
            },
            select: studentSubjectEnrollmentSelect,
          });
          const facts = (await tx.paceAssessment.findMany({
            where: {
              tenantId: actor.tenantId,
              childId,
              subjectId: subject.id,
              assessedOn: { gte: toDatabaseDate(command.startsOn) },
            },
            orderBy: [{ assessedOn: "asc" }, { id: "asc" }],
            select: assessmentSelect,
          })) as AssessmentRecord[];
          const progress = rebuildProgressRecord(
            enrollment,
            facts,
            undefined,
            new Date(),
          );
          await tx.paceProgress.upsert({
            where: {
              tenantId_childId_subjectId: {
                tenantId: actor.tenantId,
                childId,
                subjectId: subject.id,
              },
            },
            create: {
              tenantId: actor.tenantId,
              childId,
              subjectId: subject.id,
              ...progress,
            },
            update: progress,
          });
          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: enrollment.id,
            action: AuditAction.CREATED,
            metadata: {
              subjectId: subject.id,
              placementType: replacement ? "REVISION" : "INITIAL",
              replacesEnrollmentId: replacement?.id ?? null,
              reason: command.reason.trim(),
              progress: {
                currentPace: progress.currentPace,
                targetPace: progress.targetPace,
                completedPaces: progress.completedPaces,
              },
            },
          });
          await this.outbox.enqueue(tx, {
            aggregateType: "STUDENT_SUBJECT_ENROLLMENT",
            aggregateId: enrollment.id,
            eventType: replacement
              ? "ace.student-subject.revised"
              : "ace.student-subject.placed",
            payload: { subjectId: subject.id },
            idempotencyKey: `ace-student-subject:${enrollment.id}:${randomUUID()}`,
          });
          return this.toResponse(enrollment);
        },
      );
    } catch (error) {
      if (isDuplicateConflict(error)) {
        throw new ConflictException(
          "This student already has an active placement for this subject",
        );
      }
      throw error;
    }
  }

  private assertActor(actor: StudentSubjectsActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private assertChildId(childId: string): void {
    if (!childId?.trim()) throw new BadRequestException("A child is required");
  }

  private assertCommand(command: CreateStudentSubjectDto): void {
    if (!command.reason?.trim())
      throw new BadRequestException(
        "A reason is required for subject placement",
      );
    if (!command.subjectId?.trim())
      throw new BadRequestException("A subject is required");
    if (!isDateOnly(command.startsOn))
      throw new BadRequestException("Placement dates must use YYYY-MM-DD");
    for (const pace of [
      command.startingPace,
      command.currentPace,
      command.targetPace,
    ]) {
      try {
        parsePaceNumber(pace);
      } catch {
        throw new BadRequestException("Each PACE number must be valid");
      }
    }
  }

  private async requireSiteAndChild(
    tx: Prisma.TransactionClient,
    childId: string,
    actor: StudentSubjectsActor,
  ): Promise<void> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
    if (!isIanaTimezone(site.timezone))
      throw new BadRequestException("The active site has an invalid timezone");
    const child = await tx.child.findFirst({
      where: { id: childId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!child) throw new NotFoundException("Child not found");
  }

  private toResponse(
    enrollment: StudentSubjectEnrollmentRecord,
  ): StudentSubjectPlacementResponse {
    return {
      id: enrollment.id,
      subjectId: enrollment.subject.id,
      subjectName: enrollment.subject.name,
      startsOn: formatDateOnly(enrollment.startsOn),
      endsOn: enrollment.endsOn ? formatDateOnly(enrollment.endsOn) : null,
      status: "ACTIVE",
      startingPace: enrollment.startingPace,
      currentPace: enrollment.currentPace,
      targetPace: enrollment.targetPace,
    };
  }
}

const studentSubjectEnrollmentSelect = {
  id: true,
  startsOn: true,
  endsOn: true,
  status: true,
  startingPace: true,
  currentPace: true,
  targetPace: true,
  subject: { select: { id: true, name: true } },
} satisfies Prisma.StudentSubjectEnrollmentSelect;

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

function previousDate(value: string): string {
  const date = toDatabaseDate(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return formatDateOnly(date);
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

function isDuplicateConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
