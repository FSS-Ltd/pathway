import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { TrackerHistoryRequirementPage } from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { AuditAction } from "../audit/audit.types";
import {
  TrackerAccessService,
  auditTracker,
  trackerScope,
} from "./tracker-access";
import { serializeAttestation } from "./tracker-record";
/** Retained records remain discoverable independently of current catalogue coverage. */
@Injectable()
export class TrackerHistoryService {
  constructor(
    @Inject(TrackerAccessService) private readonly access: TrackerAccessService,
  ) {}
  async requirements(
    actor: ComplianceActor,
    cursor?: string,
  ): Promise<TrackerHistoryRequirementPage> {
    return this.access.run(actor, "read", async (tx) => {
      const scope = trackerScope(actor);
      if (cursor) {
        const confirmation = await tx.complianceAttestation.findFirst({
          where: { ...scope, requirementId: cursor },
          select: { id: true },
        });
        const evidence = confirmation
          ? null
          : await tx.complianceEvidence.findFirst({
              where: { ...scope, requirementId: cursor },
              select: { id: true },
            });
        if (!confirmation && !evidence)
          throw new NotFoundException("History cursor not found");
      }
      const rows = await tx.$queryRaw<
        { requirementId: string; requirementVersion: number }[]
      >`
    SELECT "requirementId", MAX("requirementVersion")::integer AS "requirementVersion"
    FROM (
      SELECT "requirementId", "requirementVersion" FROM "ComplianceAttestation"
      WHERE "tenantId"=${actor.tenantId} AND "orgId"=${actor.orgId}
      UNION ALL
      SELECT "requirementId", "requirementVersion" FROM "ComplianceEvidence"
      WHERE "tenantId"=${actor.tenantId} AND "orgId"=${actor.orgId}
    ) retained
    WHERE (${cursor ?? null}::text IS NULL OR "requirementId">${cursor ?? null}::text)
    GROUP BY "requirementId" ORDER BY "requirementId" ASC LIMIT 51`;
      const visible = rows.slice(0, 50);
      const latest = await tx.complianceAttestation.groupBy({
        by: ["requirementId"],
        where: {
          ...scope,
          requirementId: { in: visible.map((row) => row.requirementId) },
        },
        _max: { revision: true },
      });
      const records = latest.length
        ? await tx.complianceAttestation.findMany({
            where: {
              ...scope,
              OR: latest.map((row) => ({
                requirementId: row.requirementId,
                revision: row._max.revision ?? 0,
              })),
            },
          })
        : [];
      const snapshots = new Map(
        records.map((row) => [
          row.requirementId,
          serializeAttestation(row).requirement,
        ]),
      );
      const items = visible.map((row) => {
        const snapshot = snapshots.get(row.requirementId);
        return {
          ...row,
          action:
            snapshot?.version === row.requirementVersion
              ? snapshot.action
              : null,
        };
      });
      await auditTracker(
        tx,
        actor,
        AuditAction.VIEWED,
        records.map((row) => row.id),
      );
      return {
        items,
        nextCursor:
          rows.length > 50 ? items[items.length - 1].requirementId : null,
      };
    });
  }
}
