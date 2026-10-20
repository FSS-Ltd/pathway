import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import {
  assertHomeworkActor,
  requireStaffAccess,
  type HomeworkActor,
} from "./homework-access";
import type { ReviewSubmissionDto } from "./dto/review-submission.dto";
import { OutboxService } from "../common/outbox/outbox.service";
import { enqueueStudentAndGuardianEmail } from "./homework-notifications";

export interface HomeworkReviewQueueItem {
  assignmentId: string;
  assignmentTitle: string;
  submissionId: string;
  versionId: string;
  version: number;
  studentName: string;
  text: string;
  submittedAt: Date;
  late: boolean;
  review: { id: string; releasedAt: Date | null } | null;
  evidence: {
    id: string;
    fileName: string;
    mimeType: string;
  } | null;
}

@Injectable()
export class HomeworkReviewService {
  constructor(@Inject(OutboxService) private readonly outbox: OutboxService) {}

  async release(reviewId: string, actor: HomeworkActor) {
    assertHomeworkActor(actor);
    if (process.env.ACE_HOMEWORK_REVIEWS_ENABLED !== "true") {
      throw new ServiceUnavailableException("Homework reviews are not enabled");
    }
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const target = await tx.aceHomeworkReview.findFirst({
        where: { id: reviewId, tenantId: actor.tenantId },
        select: {
          id: true,
          decision: true,
          versionId: true,
          version: {
            select: {
              submission: {
                select: {
                  status: true,
                  version: true,
                  recipient: {
                    select: {
                      id: true,
                      childId: true,
                      assignment: {
                        select: { yearBandId: true, status: true },
                      },
                    },
                  },
                },
              },
              number: true,
            },
          },
        },
      });
      if (!target) throw new NotFoundException("Homework review not found");
      await requireStaffAccess(
        tx,
        actor,
        target.version.submission.recipient.assignment.yearBandId,
      );
      if (
        target.decision !== "COMPLETED" ||
        target.version.submission.status !== "COMPLETED" ||
        target.version.submission.version !== target.version.number ||
        target.version.submission.recipient.assignment.status !== "PUBLISHED"
      ) {
        throw new ConflictException("Only completed homework can be released");
      }
      const released = await tx.aceHomeworkReview.updateMany({
        where: { id: reviewId, tenantId: actor.tenantId, releasedAt: null },
        data: { releasedAt: new Date(), releasedByUserId: actor.userId },
      });
      if (released.count > 0) {
        await recordAuditEventInTransaction(tx, {
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          entityType: AuditEntityType.ACE_RECORD,
          entityId: reviewId,
          action: AuditAction.UPDATED,
          metadata: {
            kind: "homework_review_release",
            versionId: target.versionId,
          },
        });
        await enqueueStudentAndGuardianEmail(tx, this.outbox, {
          tenantId: actor.tenantId,
          recipientId: target.version.submission.recipient.id,
          childId: target.version.submission.recipient.childId,
          sourceId: reviewId,
          action: "RELEASED",
        });
      }
      return tx.aceHomeworkReview.findUniqueOrThrow({
        where: { id_tenantId: { id: reviewId, tenantId: actor.tenantId } },
        select: { id: true, versionId: true, decision: true, releasedAt: true },
      });
    });
  }

  async review(input: ReviewSubmissionDto, actor: HomeworkActor) {
    assertHomeworkActor(actor);
    if (process.env.ACE_HOMEWORK_REVIEWS_ENABLED !== "true") {
      throw new ServiceUnavailableException("Homework reviews are not enabled");
    }
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const target = await tx.aceHomeworkSubmissionVersion.findFirst({
        where: { id: input.versionId, tenantId: actor.tenantId },
        select: {
          id: true,
          number: true,
          submissionId: true,
          submission: {
            select: {
              recipient: {
                select: {
                  id: true,
                  childId: true,
                  assignment: {
                    select: { yearBandId: true, status: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!target) throw new NotFoundException("Homework submission not found");
      await requireStaffAccess(
        tx,
        actor,
        target.submission.recipient.assignment.yearBandId,
      );
      await tx.$queryRaw`
        SELECT "id" FROM "AceHomeworkSubmission"
        WHERE "id" = ${target.submissionId} AND "tenantId" = ${actor.tenantId}
        FOR UPDATE
      `;
      const previous = await tx.aceHomeworkReview.findUnique({
        where: {
          versionId_tenantId: {
            versionId: input.versionId,
            tenantId: actor.tenantId,
          },
        },
      });
      if (previous) {
        if (
          previous.idempotencyKey !== input.idempotencyKey ||
          previous.decision !== input.decision ||
          previous.studentFeedback !== input.feedback ||
          previous.staffNote !== input.staffNote
        ) {
          throw new ConflictException(
            "This submission has already been reviewed",
          );
        }
        return {
          id: previous.id,
          versionId: previous.versionId,
          decision: previous.decision,
          reviewedAt: previous.reviewedAt,
          releasedAt: previous.releasedAt,
        };
      }
      const submission = await tx.aceHomeworkSubmission.findUniqueOrThrow({
        where: {
          id_tenantId: { id: target.submissionId, tenantId: actor.tenantId },
        },
        select: { status: true, version: true },
      });
      if (
        submission.status !== "SUBMITTED" ||
        submission.version !== target.number ||
        target.submission.recipient.assignment.status !== "PUBLISHED"
      ) {
        throw new ConflictException("Submission changed before review");
      }
      const review = await tx.aceHomeworkReview.create({
        data: {
          tenantId: actor.tenantId,
          versionId: input.versionId,
          reviewedByUserId: actor.userId,
          decision: input.decision,
          studentFeedback: input.feedback,
          staffNote: input.staffNote,
          idempotencyKey: input.idempotencyKey,
        },
        select: {
          id: true,
          versionId: true,
          decision: true,
          reviewedAt: true,
          releasedAt: true,
        },
      });
      await tx.aceHomeworkSubmission.update({
        where: {
          id_tenantId: { id: target.submissionId, tenantId: actor.tenantId },
        },
        data: { status: input.decision },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: review.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "homework_review",
          decision: review.decision,
          versionId: input.versionId,
        },
      });
      if (input.decision === "RETURNED") {
        await enqueueStudentAndGuardianEmail(tx, this.outbox, {
          tenantId: actor.tenantId,
          recipientId: target.submission.recipient.id,
          childId: target.submission.recipient.childId,
          sourceId: review.id,
          action: "RETURNED",
        });
      }
      return review;
    });
  }

  async list(
    actor: HomeworkActor,
  ): Promise<{ reviewsEnabled: boolean; items: HomeworkReviewQueueItem[] }> {
    assertHomeworkActor(actor);
    const items = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        const { leader, today } = await requireStaffAccess(tx, actor);
        const bands = leader
          ? null
          : await tx.aceStaffYearBandAssignment.findMany({
              where: {
                tenantId: actor.tenantId,
                userId: actor.userId,
                startsOn: { lte: today },
                OR: [{ endsOn: null }, { endsOn: { gte: today } }],
              },
              select: { yearBandId: true },
            });
        if (bands?.length === 0) return [];
        const submissions = await tx.aceHomeworkSubmission.findMany({
          where: {
            tenantId: actor.tenantId,
            OR: [
              { status: "SUBMITTED" },
              {
                status: "COMPLETED",
                versions: {
                  some: {
                    review: {
                      is: { decision: "COMPLETED", releasedAt: null },
                    },
                  },
                },
              },
            ],
            recipient: {
              tenantId: actor.tenantId,
              assignment: {
                tenantId: actor.tenantId,
                status: "PUBLISHED",
                ...(bands
                  ? { yearBandId: { in: bands.map((item) => item.yearBandId) } }
                  : {}),
              },
            },
          },
          select: {
            id: true,
            recipient: {
              select: {
                assignment: { select: { id: true, title: true } },
                child: {
                  select: {
                    firstName: true,
                    lastName: true,
                    preferredName: true,
                  },
                },
              },
            },
            versions: {
              orderBy: { number: "desc" },
              take: 1,
              select: {
                id: true,
                number: true,
                text: true,
                submittedAt: true,
                late: true,
                review: { select: { id: true, releasedAt: true } },
                evidence: {
                  select: {
                    id: true,
                    fileName: true,
                    mimeType: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        });
        return submissions.flatMap((submission) => {
          const version = submission.versions[0];
          if (!version || version.review?.releasedAt) return [];
          const child = submission.recipient.child;
          return [
            {
              assignmentId: submission.recipient.assignment.id,
              assignmentTitle: submission.recipient.assignment.title,
              submissionId: submission.id,
              versionId: version.id,
              version: version.number,
              studentName: `${child.preferredName ?? child.firstName} ${child.lastName}`,
              text: version.text,
              submittedAt: version.submittedAt,
              late: version.late,
              review: version.review,
              evidence:
                version.evidence?.status === "CLEAN"
                  ? {
                      id: version.evidence.id,
                      fileName: version.evidence.fileName,
                      mimeType: version.evidence.mimeType,
                    }
                  : null,
            },
          ];
        });
      },
    );
    return {
      reviewsEnabled: process.env.ACE_HOMEWORK_REVIEWS_ENABLED === "true",
      items,
    };
  }
}
