import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import type { AgreementAssignment, AgreementPdfInput } from "@pathway/types";
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
  findAgreementAssignment,
  findAgreementVersion,
} from "./agreement-queries";
import { serializeAssignment } from "./agreement-record";
interface AcceptanceInput {
  versionId: string;
  typedName: string;
}
interface SignedInput extends AcceptanceInput {
  signedOn: string;
  pdf: AgreementPdfInput;
}
@Injectable()
export class AgreementAcceptanceService {
  private readonly logger = new Logger(AgreementAcceptanceService.name);
  constructor(
    @Inject(AgreementAccessService)
    private readonly access: AgreementAccessService,
    @Inject(AgreementFiles) private readonly files: AgreementFiles,
  ) {}
  async acknowledge(
    actor: ComplianceActor,
    id: string,
    input: AcceptanceInput,
  ): Promise<AgreementAssignment> {
    return this.record(actor, id, input, null, null);
  }
  async signedCopy(
    actor: ComplianceActor,
    id: string,
    input: SignedInput,
  ): Promise<AgreementAssignment> {
    await this.access.run(actor, "manage", async (tx) => {
      const row = await findAgreementAssignment(tx, actor, id, false);
      if (
        row.acceptance ||
        row.supersededAt ||
        row.versionId !== input.versionId
      )
        throw new ConflictException(
          "This assignment is no longer awaiting acceptance",
        );
    });
    const file = await this.files.upload(actor.tenantId, input.pdf);
    try {
      return await this.record(actor, id, input, file, input.signedOn);
    } catch (error) {
      this.logger.warn({
        message:
          "Unreferenced private agreement upload retained for controlled cleanup",
        key: file.key,
      });
      throw error;
    }
  }
  private async record(
    actor: ComplianceActor,
    id: string,
    input: AcceptanceInput,
    file: StoredAgreementFile | null,
    signedOn: string | null,
  ): Promise<AgreementAssignment> {
    return this.access.run(actor, file ? "manage" : "own", async (tx) => {
      const initial = await findAgreementAssignment(tx, actor, id, !file);
      await lockAgreement(tx, actor, initial.version.documentId);
      const row = await findAgreementAssignment(tx, actor, id, !file);
      const version = await findAgreementVersion(tx, actor, row.versionId);
      if (
        row.acceptance ||
        row.supersededAt ||
        row.versionId !== input.versionId ||
        version.document.latestVersion !== version.version
      )
        throw new ConflictException(
          "This assignment is no longer awaiting acceptance. Reload it to view the current record.",
        );
      await eligibleRecipient(tx, actor, row.recipientUserId);
      await tx.complianceAgreementAcceptance.create({
        data: {
          ...agreementScope(actor),
          assignmentId: id,
          method: file ? "RECORDED_SIGNED_COPY" : "ACKNOWLEDGED",
          typedName: input.typedName,
          recordedByUserId: actor.userId,
          signedOn: signedOn ? new Date(`${signedOn}T00:00:00.000Z`) : null,
          signedStorageKey: file?.key ?? null,
          signedFileName: file?.fileName ?? null,
          signedSha256: file?.sha256 ?? null,
        },
      });
      await auditAgreement(tx, actor, AuditAction.CREATED, [id]);
      return serializeAssignment(
        await findAgreementAssignment(tx, actor, id, !file),
      );
    });
  }
}
