import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  StorageObjectTooLargeError,
  SupabaseStorageService,
} from "../common/storage/supabase-storage.service";
import { homeworkEvidenceKey } from "../common/storage/storage-key.util";
import {
  MAX_HOMEWORK_EVIDENCE_BYTES,
  validateEvidenceIntent,
  verifyEvidenceBytes,
} from "../storage/homework-evidence.policy";
import { HomeworkMalwareScanner } from "../storage/homework-malware-scanner";
import {
  requireReleasedRecipient,
  withStudentHomework,
} from "./homework-student-access";
import { requireHomeworkSubmissionsEnabled } from "./homework-submission.service";

type IntentInput = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
};

@Injectable()
export class HomeworkEvidenceService {
  constructor(
    @Inject(SupabaseStorageService)
    private readonly storage: SupabaseStorageService,
    @Inject(HomeworkMalwareScanner)
    private readonly scanner: HomeworkMalwareScanner,
  ) {}

  async issueIntent(
    tenantId: string,
    userId: string,
    assignmentId: string,
    input: IntentInput,
  ) {
    requireHomeworkSubmissionsEnabled();
    validateEvidenceIntent(input);
    if (!this.storage.isConfigured() || !this.scanner.isConfigured()) {
      throw new ServiceUnavailableException("Evidence upload is unavailable");
    }
    const evidenceId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const record = await withStudentHomework(
      tenantId,
      userId,
      async (context) => {
        const recipient = await requireReleasedRecipient(context, assignmentId);
        const submitted = await context.tx.aceHomeworkSubmission.findUnique({
          where: {
            recipientId_tenantId: { recipientId: recipient.id, tenantId },
          },
          select: { status: true },
        });
        if (submitted?.status === "SUBMITTED") {
          throw new ConflictException(
            "Submitted homework cannot accept new evidence",
          );
        }
        const objectKey = homeworkEvidenceKey(
          tenantId,
          recipient.id,
          evidenceId,
          input.mimeType,
          "upload",
        );
        return context.tx.aceHomeworkEvidence.create({
          data: {
            id: evidenceId,
            tenantId,
            recipientId: recipient.id,
            uploadedByUserId: userId,
            objectKey,
            fileName: input.fileName,
            mimeType: input.mimeType,
            byteLength: input.byteLength,
            sha256: input.sha256,
            expiresAt,
          },
          select: { id: true, objectKey: true, expiresAt: true },
        });
      },
    );
    const uploadUrl = await this.storage.createSignedUploadUrl(
      record.objectKey,
    );
    if (!uploadUrl)
      throw new ServiceUnavailableException("Evidence upload is unavailable");
    return { id: record.id, uploadUrl, expiresAt: record.expiresAt };
  }

  async completeIntent(
    tenantId: string,
    userId: string,
    assignmentId: string,
    evidenceId: string,
  ) {
    requireHomeworkSubmissionsEnabled();
    const record = await withStudentHomework(
      tenantId,
      userId,
      async (context) => {
        const recipient = await requireReleasedRecipient(context, assignmentId);
        const evidence = await context.tx.aceHomeworkEvidence.findFirst({
          where: {
            id: evidenceId,
            tenantId,
            recipientId: recipient.id,
            uploadedByUserId: userId,
          },
          select: {
            id: true,
            recipientId: true,
            objectKey: true,
            fileName: true,
            mimeType: true,
            byteLength: true,
            sha256: true,
            status: true,
            expiresAt: true,
          },
        });
        if (!evidence) throw new NotFoundException("Evidence upload not found");
        if (evidence.status !== "PENDING") {
          return evidence;
        }
        if (evidence.expiresAt <= context.now) {
          throw new ConflictException("Evidence upload expired");
        }
        return evidence;
      },
    );
    if (record.status !== "PENDING") {
      return { id: record.id, status: record.status };
    }
    const bucket = this.storage.privateBucketName();
    if (!bucket)
      throw new ServiceUnavailableException("Evidence upload is unavailable");
    let body: Buffer | null;
    try {
      body = await this.storage.downloadObject(
        bucket,
        record.objectKey,
        MAX_HOMEWORK_EVIDENCE_BYTES,
      );
    } catch (error) {
      if (error instanceof StorageObjectTooLargeError) {
        await this.markInspected(
          tenantId,
          userId,
          assignmentId,
          evidenceId,
          "REJECTED",
        );
        throw new BadRequestException("Evidence file exceeds the 2 MB limit");
      }
      throw new ServiceUnavailableException(
        "Evidence verification is unavailable",
      );
    }
    if (!body) throw new ConflictException("Evidence upload has not finished");
    try {
      validateEvidenceIntent(record);
      verifyEvidenceBytes(body, record);
    } catch (error) {
      await this.markInspected(
        tenantId,
        userId,
        assignmentId,
        evidenceId,
        "REJECTED",
      );
      throw error;
    }
    const clean = await this.scanner.scan(body);
    let cleanKey: string | undefined;
    if (clean) {
      cleanKey = homeworkEvidenceKey(
        tenantId,
        record.recipientId,
        evidenceId,
        record.mimeType,
        "clean",
      );
      const copied = await this.storage.uploadObject({
        bucket: "private",
        key: cleanKey,
        body,
        contentType: record.mimeType,
      });
      if (!copied)
        throw new ServiceUnavailableException(
          "Evidence verification is unavailable",
        );
    }
    return this.markInspected(
      tenantId,
      userId,
      assignmentId,
      evidenceId,
      clean ? "CLEAN" : "REJECTED",
      cleanKey,
    );
  }

  private async markInspected(
    tenantId: string,
    userId: string,
    assignmentId: string,
    evidenceId: string,
    status: "CLEAN" | "REJECTED",
    cleanKey?: string,
  ) {
    return withStudentHomework(tenantId, userId, async (context) => {
      const recipient = await requireReleasedRecipient(context, assignmentId);
      const evidence = await context.tx.aceHomeworkEvidence.findFirst({
        where: {
          id: evidenceId,
          tenantId,
          recipientId: recipient.id,
          uploadedByUserId: userId,
        },
        select: { id: true, status: true },
      });
      if (!evidence) throw new NotFoundException("Evidence upload not found");
      if (evidence.status !== "PENDING") return evidence;
      const changed = await context.tx.aceHomeworkEvidence.updateMany({
        where: { id: evidenceId, tenantId, status: "PENDING" },
        data: {
          status,
          inspectedAt: context.now,
          ...(cleanKey ? { objectKey: cleanKey } : {}),
        },
      });
      if (changed.count === 0) {
        return context.tx.aceHomeworkEvidence.findUniqueOrThrow({
          where: { id_tenantId: { id: evidenceId, tenantId } },
          select: { id: true, status: true },
        });
      }
      return { id: evidenceId, status };
    });
  }
}
