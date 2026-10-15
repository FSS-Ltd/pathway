import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type {
  AgreementVersionInput,
  AgreementDocument,
  AgreementAssignmentPage,
} from "@pathway/types";
import { AuditAction } from "../audit/audit.types";
import type { ComplianceActor } from "./compliance.service";
import {
  AgreementAccessService,
  agreementScope,
  auditAgreement,
  eligibleRecipient,
  lockAgreement,
} from "./agreement-access";
import { AgreementFiles, type StoredAgreementFile } from "./agreement-files";
import {
  findAgreementDocument,
  findAgreementVersion,
} from "./agreement-queries";
import { assignmentInclude, serializeAssignment } from "./agreement-record";
@Injectable()
export class AgreementPublicationService {
  private readonly logger = new Logger(AgreementPublicationService.name);
  constructor(
    @Inject(AgreementAccessService)
    private readonly access: AgreementAccessService,
    @Inject(AgreementFiles) private readonly files: AgreementFiles,
  ) {}
  async publish(
    actor: ComplianceActor,
    input: AgreementVersionInput,
    existing?: { id: string; expectedVersion: number },
  ): Promise<AgreementDocument> {
    await this.access.run(actor, "manage", async (tx) => {
      if (existing) {
        const current = await findAgreementDocument(tx, actor, existing.id);
        if (current.latestVersion.version !== existing.expectedVersion)
          throw new ConflictException(
            "This agreement changed. Reload before publishing.",
          );
      }
    });
    const file = input.originalPdf
      ? await this.files.upload(actor.tenantId, input.originalPdf)
      : null;
    try {
      return await this.access.run(actor, "manage", async (tx) => {
        let documentId: string;
        let version = 1;
        if (existing) {
          await lockAgreement(tx, actor, existing.id);
          const current = await findAgreementDocument(tx, actor, existing.id);
          if (current.latestVersion.version !== existing.expectedVersion)
            throw new ConflictException(
              "This agreement changed. Reload before publishing.",
            );
          documentId = existing.id;
          version = existing.expectedVersion + 1;
          const updated = await tx.complianceAgreementDocument.updateMany({
            where: {
              id: documentId,
              ...agreementScope(actor),
              latestVersion: existing.expectedVersion,
            },
            data: { latestVersion: version },
          });
          if (updated.count !== 1)
            throw new ConflictException(
              "This agreement changed. Reload before publishing.",
            );
          await tx.complianceAgreementAssignment.updateMany({
            where: {
              ...agreementScope(actor),
              supersededAt: null,
              version: { documentId },
            },
            data: { supersededAt: new Date() },
          });
        } else {
          const doc = await tx.complianceAgreementDocument.create({
            data: {
              ...agreementScope(actor),
              latestVersion: 1,
              createdByUserId: actor.userId,
            },
          });
          documentId = doc.id;
        }
        await tx.complianceAgreementVersion.create({
          data: {
            ...agreementScope(actor),
            documentId,
            version,
            title: input.title,
            contentText: input.contentText,
            createdByUserId: actor.userId,
            ...this.fileValues(file),
          },
        });
        await auditAgreement(
          tx,
          actor,
          existing ? AuditAction.UPDATED : AuditAction.CREATED,
          [documentId],
        );
        return findAgreementDocument(tx, actor, documentId);
      });
    } catch (error) {
      if (file)
        this.logger.warn({
          message:
            "Unreferenced private agreement upload retained for controlled cleanup",
          key: file.key,
        });
      throw error;
    }
  }
  private fileValues(
    file: StoredAgreementFile | null,
  ): Pick<
    Prisma.ComplianceAgreementVersionUncheckedCreateInput,
    "originalStorageKey" | "originalFileName" | "originalSha256"
  > {
    return {
      originalStorageKey: file?.key ?? null,
      originalFileName: file?.fileName ?? null,
      originalSha256: file?.sha256 ?? null,
    };
  }
  async assign(
    actor: ComplianceActor,
    versionId: string,
    recipients: string[],
  ): Promise<AgreementAssignmentPage> {
    return this.access.run(actor, "manage", async (tx) => {
      const initial = await findAgreementVersion(tx, actor, versionId);
      await lockAgreement(tx, actor, initial.documentId);
      const version = await findAgreementVersion(tx, actor, versionId);
      if (version.version !== version.document.latestVersion)
        throw new ConflictException(
          "Publish or select the current agreement version before assigning",
        );
      for (const recipient of recipients)
        await eligibleRecipient(tx, actor, recipient);
      for (const recipientUserId of recipients) {
        const existing = await tx.complianceAgreementAssignment.findFirst({
          where: { ...agreementScope(actor), versionId, recipientUserId },
          select: { id: true },
        });
        if (!existing)
          await tx.complianceAgreementAssignment.create({
            data: {
              ...agreementScope(actor),
              versionId,
              recipientUserId,
              assignedByUserId: actor.userId,
              adultConfirmedAt: new Date(),
            },
          });
      }
      const rows = await tx.complianceAgreementAssignment.findMany({
        where: {
          ...agreementScope(actor),
          versionId,
          recipientUserId: { in: recipients },
        },
        include: assignmentInclude,
        orderBy: { id: "asc" },
      });
      await auditAgreement(
        tx,
        actor,
        AuditAction.ASSIGNMENT_CREATED,
        rows.map((row) => row.id),
      );
      return { items: rows.map(serializeAssignment), nextCursor: null };
    });
  }
}
