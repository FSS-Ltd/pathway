import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  TrackerChecklist,
  TrackerAttestationInput,
  TrackerAttestation,
  TrackerHistoryPage,
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
import { serializeAttestation } from "./tracker-record";
import { page } from "./agreement-record";
@Injectable()
export class TrackerService {
  constructor(
    @Inject(TrackerAccessService) private readonly access: TrackerAccessService,
    @Inject(TrackerCatalogueService)
    private readonly catalogue: TrackerCatalogueService,
  ) {}
  async checklist(actor: ComplianceActor): Promise<TrackerChecklist> {
    return this.access.run(actor, "read", async (tx) => {
      const result = await readTrackerChecklist(
        tx,
        actor,
        this.catalogue.catalogue,
      );
      await auditTracker(tx, actor, AuditAction.VIEWED, []);
      return result;
    });
  }
  async attest(
    actor: ComplianceActor,
    input: TrackerAttestationInput,
  ): Promise<TrackerAttestation> {
    return this.access.run(actor, "manage", async (tx) => {
      await lockTrackerSite(tx, actor);
      const scope = trackerScope(actor);
      const profile = await tx.complianceSiteProfile.findFirst({
        where: scope,
      });
      if (!profile || profile.version !== input.profileVersion)
        throw new ConflictException(
          "The site profile changed. Reload before confirming.",
        );
      const checklist = await readTrackerChecklist(
        tx,
        actor,
        this.catalogue.catalogue,
      );
      if (checklist.profileNeedsSync)
        throw new ConflictException(
          "The organisation details changed. Save the site profile before confirming.",
        );
      const item = requireApplicableItem(
        checklist,
        input.requirementId,
        input.requirementVersion,
      );
      if (
        input.status === "NOT_APPLICABLE" &&
        (!item.requirement.allowsNotApplicable ||
          !input.notApplicableReason?.trim())
      )
        throw new BadRequestException(
          "This requirement cannot be dismissed without an allowed exception and reason",
        );
      const current = await tx.complianceAttestation.findFirst({
        where: { ...scope, requirementId: input.requirementId },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      if ((current?.revision ?? 0) !== input.expectedRevision)
        throw new ConflictException(
          "This confirmation changed. Reload before saving your draft.",
        );
      const row = await tx.complianceAttestation.create({
        data: {
          ...scope,
          profileId: profile.id,
          profileVersion: profile.version,
          requirementId: input.requirementId,
          requirementVersion: input.requirementVersion,
          revision: input.expectedRevision + 1,
          requirementJson: JSON.stringify(item.requirement),
          status: input.status,
          notes: input.notes,
          notApplicableReason: input.notApplicableReason,
          reviewDueAt: input.reviewDueAt
            ? new Date(`${input.reviewDueAt}T00:00:00.000Z`)
            : null,
          createdByUserId: actor.userId,
        },
      });
      await auditTracker(tx, actor, AuditAction.CREATED, [row.id]);
      return serializeAttestation(row);
    });
  }
  async history(
    actor: ComplianceActor,
    requirementId: string,
    cursor?: string,
  ): Promise<TrackerHistoryPage> {
    return this.access.run(actor, "read", async (tx) => {
      const scope = { ...trackerScope(actor), requirementId };
      if (
        cursor &&
        !(await tx.complianceAttestation.findFirst({
          where: { ...scope, id: cursor },
          select: { id: true },
        }))
      )
        throw new NotFoundException("History cursor not found");
      const rows = await tx.complianceAttestation.findMany({
        where: { ...scope, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: "asc" },
        take: 51,
      });
      const result = page(rows.map(serializeAttestation));
      await auditTracker(
        tx,
        actor,
        AuditAction.VIEWED,
        result.items.map((row) => row.id),
      );
      return result;
    });
  }
}
