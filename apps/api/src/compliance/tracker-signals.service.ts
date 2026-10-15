import { Inject, Injectable } from "@nestjs/common";
import type { TrackerSignal } from "@pathway/types";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { AuditAction } from "../audit/audit.types";
import type { ComplianceActor } from "./compliance.service";
import { TrackerAccessService, auditTracker } from "./tracker-access";
import {
  TRACKER_SIGNAL_READERS,
  type TrackerSignalReader,
} from "./tracker-signal-readers";
@Injectable()
export class TrackerSignalsService {
  constructor(
    @Inject(TrackerAccessService) private readonly access: TrackerAccessService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}
  async read(actor: ComplianceActor): Promise<TrackerSignal[]> {
    await this.access.run(actor, "read", (tx) =>
      auditTracker(tx, actor, AuditAction.VIEWED, []),
    );
    return Promise.all(
      TRACKER_SIGNAL_READERS.map((reader) => this.observe(actor, reader)),
    );
  }
  private async observe(
    actor: ComplianceActor,
    reader: TrackerSignalReader,
  ): Promise<TrackerSignal> {
    const now = new Date();
    const unknown: TrackerSignal = {
      key: reader.key,
      status: "UNKNOWN",
      count: null,
      missingCount: null,
      description:
        "Evidence is unavailable or your access does not include this integration.",
      observedAt: now.toISOString(),
      href: null,
    };
    try {
      return await this.access.run(actor, "read", async (tx) => {
        const grants =
          await this.permissions.listForUserWithSourcesInTransaction(
            actor.userId,
            actor.orgId,
            actor.tenantId,
            now,
            tx,
          );
        if (
          !reader.permissions.every((permission) =>
            grants.some((grant) => grant.permissionKey === permission),
          )
        )
          return unknown;
        const observation = await reader.read(tx, actor, now);
        return observation
          ? {
              ...observation,
              key: reader.key,
              status: "KNOWN",
              observedAt: now.toISOString(),
            }
          : unknown;
      });
    } catch {
      // Each reader owns its transaction: unavailable integrations cannot poison other observations.
      return unknown;
    }
  }
}
