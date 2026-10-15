import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type {
  TrackerEvidence,
  TrackerEvidenceInput,
  TrackerEvidencePage,
} from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { AuditAction } from "../audit/audit.types";
import {
  TrackerAccessService,
  auditTracker,
  trackerScope,
  lockTrackerSite,
} from "./tracker-access";
import { TrackerCatalogueService } from "./catalogue/catalogue.service";
import {
  readTrackerChecklist,
  requireApplicableItem,
} from "./tracker-checklist";
import { serializeTrackerEvidence } from "./tracker-record";
import { TrackerFiles } from "./tracker-files";
import { page } from "./agreement-record";
@Injectable()
export class TrackerEvidenceService {
  private readonly logger = new Logger(TrackerEvidenceService.name);
  constructor(
    @Inject(TrackerAccessService) private readonly access: TrackerAccessService,
    @Inject(TrackerCatalogueService)
    private readonly catalogue: TrackerCatalogueService,
    @Inject(TrackerFiles) private readonly files: TrackerFiles,
  ) {}
  private async find(
    tx: Prisma.TransactionClient,
    actor: ComplianceActor,
    id: string,
  ) {
    const row = await tx.complianceEvidence.findFirst({
      where: { ...trackerScope(actor), id },
    });
    if (!row) throw new NotFoundException("Evidence not found");
    return row;
  }
  async list(
    actor: ComplianceActor,
    requirementId: string,
    cursor?: string,
  ): Promise<TrackerEvidencePage> {
    return this.access.run(actor, "read", async (tx) => {
      if (cursor) {
        const row = await this.find(tx, actor, cursor);
        if (row.requirementId !== requirementId)
          throw new NotFoundException("Evidence cursor not found");
      }
      const rows = await tx.complianceEvidence.findMany({
        where: {
          ...trackerScope(actor),
          requirementId,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
      });
      const result = page(rows.map(serializeTrackerEvidence));
      await auditTracker(
        tx,
        actor,
        AuditAction.VIEWED,
        result.items.map((row) => row.id),
      );
      return result;
    });
  }
  async create(
    actor: ComplianceActor,
    input: TrackerEvidenceInput,
  ): Promise<TrackerEvidence> {
    await this.access.run(actor, "manage", async (tx) => {
      requireApplicableItem(
        await readTrackerChecklist(tx, actor, this.catalogue.catalogue),
        input.requirementId,
        input.requirementVersion,
      );
    });
    const stored = await this.files.upload(actor.tenantId, input.pdf);
    try {
      return await this.access.run(actor, "manage", async (tx) => {
        await lockTrackerSite(tx, actor);
        requireApplicableItem(
          await readTrackerChecklist(tx, actor, this.catalogue.catalogue),
          input.requirementId,
          input.requirementVersion,
        );
        const row = await tx.complianceEvidence.create({
          data: {
            ...trackerScope(actor),
            requirementId: input.requirementId,
            requirementVersion: input.requirementVersion,
            title: input.title,
            notes: input.notes,
            fileName: stored.fileName,
            storageKey: stored.key,
            sha256: stored.sha256,
            createdByUserId: actor.userId,
          },
        });
        await auditTracker(tx, actor, AuditAction.CREATED, [row.id]);
        return serializeTrackerEvidence(row);
      });
    } catch (error) {
      this.logger.warn({
        event: "compliance_evidence_orphan",
        storageKey: stored.key,
        tenantId: actor.tenantId,
      });
      throw error;
    }
  }
  async archive(actor: ComplianceActor, id: string): Promise<TrackerEvidence> {
    return this.access.run(actor, "manage", async (tx) => {
      await lockTrackerSite(tx, actor);
      const row = await this.find(tx, actor, id);
      const archived = row.archivedAt
        ? row
        : await tx.complianceEvidence.update({
            where: { id },
            data: { archivedAt: new Date() },
          });
      await auditTracker(tx, actor, AuditAction.UPDATED, [id]);
      return serializeTrackerEvidence(archived);
    });
  }
  async file(
    actor: ComplianceActor,
    id: string,
  ): Promise<{ bytes: Buffer; fileName: string }> {
    const row = await this.access.run(actor, "read", async (tx) => {
      const row = await this.find(tx, actor, id);
      await auditTracker(tx, actor, AuditAction.VIEWED, [id]);
      return row;
    });
    const file = await this.files.download({
      key: row.storageKey,
      fileName: row.fileName,
      sha256: row.sha256,
    });
    await this.access.run(actor, "read", async (tx) => {
      await this.find(tx, actor, id);
      await auditTracker(tx, actor, AuditAction.EXPORTED, [id]);
    });
    return file;
  }
}
