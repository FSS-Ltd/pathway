import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import {
  requireReleasedRecipient,
  withStudentHomework,
} from "./homework-student-access";

export function requireHomeworkSubmissionsEnabled(): void {
  if (process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED !== "true") {
    throw new ServiceUnavailableException(
      "Homework submissions are not enabled",
    );
  }
}

@Injectable()
export class HomeworkSubmissionService {
  async list(tenantId: string, userId: string) {
    return withStudentHomework(tenantId, userId, async (context) => {
      const recipients = await context.tx.aceHomeworkRecipient.findMany({
        where: {
          tenantId,
          childId: context.childId,
          assignment: {
            tenantId,
            status: "PUBLISHED",
            publishedAt: { lte: context.now },
          },
        },
        select: {
          assignment: {
            select: { id: true, title: true, instructions: true, dueAt: true },
          },
          submission: {
            select: {
              id: true,
              status: true,
              draftText: true,
              version: true,
              versions: {
                select: {
                  id: true,
                  number: true,
                  text: true,
                  late: true,
                  submittedAt: true,
                  evidence: {
                    select: {
                      id: true,
                      fileName: true,
                      mimeType: true,
                      status: true,
                    },
                  },
                },
                orderBy: { number: "desc" },
              },
            },
          },
        },
        orderBy: { publishedAt: "desc" },
      });
      return {
        submissionsEnabled:
          process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED === "true",
        assignments: recipients.map((row) => ({
          ...row.assignment,
          submission: row.submission,
        })),
      };
    });
  }

  async saveDraft(
    tenantId: string,
    userId: string,
    assignmentId: string,
    text: string,
  ) {
    requireHomeworkSubmissionsEnabled();
    return withStudentHomework(tenantId, userId, async (context) => {
      const recipient = await requireReleasedRecipient(context, assignmentId);
      const submission = await context.tx.aceHomeworkSubmission.upsert({
        where: {
          recipientId_tenantId: { recipientId: recipient.id, tenantId },
        },
        create: { tenantId, recipientId: recipient.id, draftText: text },
        update: {},
        select: { id: true },
      });
      const changed = await context.tx.aceHomeworkSubmission.updateMany({
        where: {
          id: submission.id,
          tenantId,
          status: { in: ["DRAFT", "RETURNED"] },
        },
        data: { draftText: text },
      });
      if (changed.count !== 1) {
        throw new ConflictException("Submitted homework cannot be edited");
      }
      return context.tx.aceHomeworkSubmission.findUniqueOrThrow({
        where: { id_tenantId: { id: submission.id, tenantId } },
        select: { id: true, status: true, draftText: true, version: true },
      });
    });
  }

  async submit(
    tenantId: string,
    userId: string,
    assignmentId: string,
    input: { text: string; evidenceId?: string; idempotencyKey: string },
  ) {
    requireHomeworkSubmissionsEnabled();
    if (!input.text.trim() && !input.evidenceId) {
      throw new BadRequestException(
        "Add an answer or evidence before submitting",
      );
    }
    return withStudentHomework(tenantId, userId, async (context) => {
      const recipient = await requireReleasedRecipient(context, assignmentId);
      const submission = await context.tx.aceHomeworkSubmission.upsert({
        where: {
          recipientId_tenantId: { recipientId: recipient.id, tenantId },
        },
        create: { tenantId, recipientId: recipient.id },
        update: {},
        select: { id: true },
      });
      await context.tx.$queryRaw`
        SELECT "id" FROM "AceHomeworkSubmission"
        WHERE "id" = ${submission.id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      const previous = await context.tx.aceHomeworkSubmissionVersion.findFirst({
        where: {
          tenantId,
          submissionId: submission.id,
          idempotencyKey: input.idempotencyKey,
        },
        select: {
          id: true,
          number: true,
          text: true,
          evidenceId: true,
          submittedAt: true,
          late: true,
        },
      });
      if (previous) {
        if (
          previous.text !== input.text ||
          previous.evidenceId !== (input.evidenceId ?? null)
        ) {
          throw new ConflictException(
            "Submission retry does not match the original work",
          );
        }
        return {
          id: previous.id,
          number: previous.number,
          submittedAt: previous.submittedAt,
          late: previous.late,
        };
      }
      const current = await context.tx.aceHomeworkSubmission.findUniqueOrThrow({
        where: { id_tenantId: { id: submission.id, tenantId } },
        select: { version: true, status: true },
      });
      if (current.status === "SUBMITTED") {
        throw new ConflictException("Homework has already been submitted");
      }
      if (input.evidenceId) {
        const evidence = await context.tx.aceHomeworkEvidence.findFirst({
          where: {
            id: input.evidenceId,
            tenantId,
            recipientId: recipient.id,
            uploadedByUserId: userId,
            status: "CLEAN",
            version: null,
          },
          select: { id: true },
        });
        if (!evidence) throw new NotFoundException("Clean evidence not found");
      }
      const version = await context.tx.aceHomeworkSubmissionVersion.create({
        data: {
          tenantId,
          submissionId: submission.id,
          number: current.version + 1,
          idempotencyKey: input.idempotencyKey,
          text: input.text,
          evidenceId: input.evidenceId,
          late: context.now > recipient.assignment.dueAt,
          submittedAt: context.now,
        },
        select: { id: true, number: true, submittedAt: true, late: true },
      });
      await context.tx.aceHomeworkSubmission.update({
        where: { id_tenantId: { id: submission.id, tenantId } },
        data: {
          status: "SUBMITTED",
          draftText: input.text,
          version: current.version + 1,
        },
      });
      await recordAuditEventInTransaction(context.tx, {
        actorUserId: userId,
        tenantId,
        orgId: context.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: version.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "homework_submission",
          assignmentId,
          late: version.late,
        },
      });
      return version;
    });
  }
}
