import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AgreementAssignment,
  AgreementAssignmentPage,
  AgreementDocumentPage,
  AgreementPeoplePage,
  AgreementVersionPage,
} from "@pathway/types";
import { AuditAction } from "../audit/audit.types";
import type { ComplianceActor } from "./compliance.service";
import { complianceSiteUsers } from "./compliance-queries";
import {
  AgreementAccessService,
  agreementScope,
  auditAgreement,
} from "./agreement-access";
import { AgreementFiles } from "./agreement-files";
import {
  findAgreementAssignment,
  findAgreementDocument,
  findAgreementVersion,
} from "./agreement-queries";
import {
  assignmentInclude,
  page,
  personName,
  serializeAssignment,
  serializeVersion,
} from "./agreement-record";
import { adultUserSelect, userAgeStatus } from "./agreement-eligibility";
@Injectable()
export class AgreementsService {
  constructor(
    @Inject(AgreementAccessService)
    private readonly access: AgreementAccessService,
    @Inject(AgreementFiles) private readonly files: AgreementFiles,
  ) {}
  async documents(
    actor: ComplianceActor,
    cursor?: string,
  ): Promise<AgreementDocumentPage> {
    return this.access.run(actor, "read", async (tx) => {
      if (cursor) await findAgreementDocument(tx, actor, cursor);
      const rows = await tx.complianceAgreementDocument.findMany({
        where: {
          ...agreementScope(actor),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      const result = page(
        rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          latestVersion: serializeVersion(row.versions[0]),
        })),
      );
      await auditAgreement(
        tx,
        actor,
        AuditAction.VIEWED,
        result.items.map((row) => row.id),
      );
      return result;
    });
  }
  async versions(
    actor: ComplianceActor,
    id: string,
    cursor?: string,
  ): Promise<AgreementVersionPage> {
    return this.access.run(actor, "read", async (tx) => {
      await findAgreementDocument(tx, actor, id);
      if (cursor) {
        const anchor = await findAgreementVersion(tx, actor, cursor);
        if (anchor.documentId !== id)
          throw new NotFoundException("Version page unavailable");
      }
      const rows = await tx.complianceAgreementVersion.findMany({
        where: {
          ...agreementScope(actor),
          documentId: id,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
      });
      const result = page(rows.map(serializeVersion));
      await auditAgreement(
        tx,
        actor,
        AuditAction.VIEWED,
        result.items.map((row) => row.id),
      );
      return result;
    });
  }
  async assignments(
    actor: ComplianceActor,
    own: boolean,
    cursor?: string,
    documentId?: string,
  ): Promise<AgreementAssignmentPage> {
    return this.access.run(actor, own ? "own" : "read", async (tx) => {
      if (documentId) await findAgreementDocument(tx, actor, documentId);
      if (cursor) {
        const anchor = await findAgreementAssignment(tx, actor, cursor, own);
        if (documentId && anchor.version.documentId !== documentId)
          throw new NotFoundException("Assignment page unavailable");
      }
      const rows = await tx.complianceAgreementAssignment.findMany({
        where: {
          ...agreementScope(actor),
          ...(own ? { recipientUserId: actor.userId } : {}),
          ...(documentId ? { version: { documentId } } : {}),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
        include: assignmentInclude,
      });
      const result = page(rows.map(serializeAssignment));
      await auditAgreement(
        tx,
        actor,
        AuditAction.VIEWED,
        result.items.map((row) => row.id),
      );
      return result;
    });
  }
  async assignment(
    actor: ComplianceActor,
    id: string,
  ): Promise<AgreementAssignment> {
    const own = !(await this.access.canRead(actor));
    return this.access.run(actor, own ? "own" : "read", async (tx) => {
      const row = await findAgreementAssignment(tx, actor, id, own);
      await auditAgreement(tx, actor, AuditAction.VIEWED, [id]);
      return serializeAssignment(row);
    });
  }
  async people(
    actor: ComplianceActor,
    query = "",
    cursor?: string,
  ): Promise<AgreementPeoplePage> {
    return this.access.run(actor, "manage", async (tx) => {
      // Names are encrypted; bounded site candidates are decrypted before matching.
      if (
        cursor &&
        !(await tx.user.findFirst({
          where: {
            id: cursor,
            isActive: true,
            ...complianceSiteUsers(actor.tenantId),
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException("People page unavailable");
      const rows = await tx.user.findMany({
        where: {
          isActive: true,
          ...complianceSiteUsers(actor.tenantId),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
        select: adultUserSelect(actor.tenantId),
      });
      const candidates = rows.slice(0, 50);
      const items = candidates
        .flatMap((row) => {
          const ageStatus = userAgeStatus(row);
          return ageStatus === "MINOR" ||
            !personName(row)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())
            ? []
            : [{ id: row.id, name: personName(row), ageStatus }];
        })
        .slice(0, 50);
      await auditAgreement(
        tx,
        actor,
        AuditAction.VIEWED,
        items.map((row) => row.id),
      );
      return {
        items,
        nextCursor:
          rows.length > 50 ? candidates[candidates.length - 1].id : null,
      };
    });
  }
  async originalFile(actor: ComplianceActor, id: string) {
    const own = !(await this.access.canRead(actor));
    const file = await this.access.run(
      actor,
      own ? "own" : "read",
      async (tx) => {
        const row = await findAgreementVersion(tx, actor, id);
        if (
          own &&
          !(await tx.complianceAgreementAssignment.findFirst({
            where: {
              ...agreementScope(actor),
              versionId: id,
              recipientUserId: actor.userId,
            },
            select: { id: true },
          }))
        )
          throw new NotFoundException("Agreement file not found");
        if (
          !row.originalStorageKey ||
          !row.originalFileName ||
          !row.originalSha256
        )
          throw new NotFoundException("Agreement file not found");
        await auditAgreement(tx, actor, AuditAction.EXPORTED, [id]);
        return {
          key: row.originalStorageKey,
          fileName: row.originalFileName,
          sha256: row.originalSha256,
        };
      },
    );
    return this.files.download(file);
  }
  async signedFile(actor: ComplianceActor, id: string) {
    const own = !(await this.access.canRead(actor));
    const file = await this.access.run(
      actor,
      own ? "own" : "read",
      async (tx) => {
        const row = await findAgreementAssignment(tx, actor, id, own);
        const acceptance = row.acceptance;
        if (
          !acceptance?.signedStorageKey ||
          !acceptance.signedFileName ||
          !acceptance.signedSha256
        )
          throw new NotFoundException("Signed copy not found");
        await auditAgreement(tx, actor, AuditAction.EXPORTED, [id]);
        return {
          key: acceptance.signedStorageKey,
          fileName: acceptance.signedFileName,
          sha256: acceptance.signedSha256,
        };
      },
    );
    return this.files.download(file);
  }
}
