import { isDeepStrictEqual } from "node:util";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type {
  TrackerProfile,
  TrackerProfileInput,
  TrackerJurisdiction,
} from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { AuditAction } from "../audit/audit.types";
import {
  TrackerAccessService,
  auditTracker,
  trackerScope,
  lockTrackerSite,
} from "./tracker-access";
import { trackerLocation, trackerJurisdictionSelect } from "./tracker-location";
import { serializeTrackerProfile } from "./tracker-record";
@Injectable()
export class TrackerProfileService {
  constructor(
    @Inject(TrackerAccessService) private readonly access: TrackerAccessService,
  ) {}
  async jurisdictions(actor: ComplianceActor): Promise<TrackerJurisdiction[]> {
    return this.access.run(actor, "read", async (tx) => {
      const rows = await tx.jurisdiction.findMany({
        orderBy: [{ countryCode: "asc" }, { name: "asc" }],
        select: trackerJurisdictionSelect,
      });
      await auditTracker(tx, actor, AuditAction.VIEWED, []);
      return rows;
    });
  }
  async get(actor: ComplianceActor): Promise<TrackerProfile | null> {
    return this.access.run(actor, "read", async (tx) => {
      const row = await tx.complianceSiteProfile.findFirst({
        where: trackerScope(actor),
      });
      await auditTracker(tx, actor, AuditAction.VIEWED, row ? [row.id] : []);
      return row ? serializeTrackerProfile(row) : null;
    });
  }
  async save(
    actor: ComplianceActor,
    input: { expectedVersion: number; profile: TrackerProfileInput },
  ): Promise<TrackerProfile> {
    return this.access.run(actor, "manage", async (tx) => {
      await lockTrackerSite(tx, actor);
      await trackerLocation(tx, input.profile.jurisdictionId);
      const scope = trackerScope(actor);
      const current = await tx.complianceSiteProfile.findFirst({
        where: scope,
      });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException(
          "The site profile changed. Reload before saving your draft.",
        );
      if (
        current &&
        isDeepStrictEqual(
          serializeTrackerProfile(current).profile,
          input.profile,
        )
      ) {
        await auditTracker(tx, actor, AuditAction.VIEWED, [current.id]);
        return serializeTrackerProfile(current);
      }
      const profileJson = JSON.stringify(input.profile);
      const version = input.expectedVersion + 1;
      const data = {
        profileJson,
        version,
        jurisdictionId: input.profile.jurisdictionId,
        updatedByUserId: actor.userId,
      };
      const saved = current
        ? await tx.complianceSiteProfile.update({
            where: { id: current.id },
            data,
          })
        : await tx.complianceSiteProfile.create({
            data: { ...scope, ...data },
          });
      await tx.complianceProfileRevision.create({
        data: {
          ...scope,
          profileId: saved.id,
          version,
          profileJson,
          createdByUserId: actor.userId,
        },
      });
      await auditTracker(
        tx,
        actor,
        current ? AuditAction.UPDATED : AuditAction.CREATED,
        [saved.id],
      );
      return serializeTrackerProfile(saved);
    });
  }
}
