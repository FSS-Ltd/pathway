import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { TrackerChecklist, TrackerChecklistItem } from "@pathway/types";
import type { TrackerCatalogue } from "./catalogue";
import type { ComplianceActor } from "./compliance.service";
import { trackerScope } from "./tracker-access";
import {
  serializeTrackerProfile,
  serializeAttestation,
} from "./tracker-record";
import { trackerLocation } from "./tracker-location";
import { buildTrackerChecklist } from "./tracker-engine";
import {
  applyOrganisationFacts,
  trackerOrganisationFacts,
} from "./tracker-organisation";
export async function readTrackerChecklist(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  catalogue: TrackerCatalogue,
): Promise<TrackerChecklist> {
  const scope = trackerScope(actor);
  const row = await tx.complianceSiteProfile.findFirst({ where: scope });
  const profile = row ? serializeTrackerProfile(row) : null;
  const organisationFacts = await trackerOrganisationFacts(tx, actor.orgId);
  const effectiveProfile = profile
    ? {
        ...profile,
        profile: applyOrganisationFacts(profile.profile, organisationFacts),
      }
    : null;
  const profileNeedsSync = Boolean(
    profile &&
    (profile.profile.sector !== effectiveProfile?.profile.sector ||
      profile.profile.vertical !== effectiveProfile?.profile.vertical ||
      profile.profile.ace !== effectiveProfile?.profile.ace),
  );
  const requirementIds = [...new Set(catalogue.requirements.map((r) => r.id))];
  const latest = await tx.complianceAttestation.groupBy({
    by: ["requirementId"],
    where: { ...scope, requirementId: { in: requirementIds } },
    _max: { revision: true },
  });
  const rows = latest.length
    ? await tx.complianceAttestation.findMany({
        where: {
          ...scope,
          OR: latest.map((r) => ({
            requirementId: r.requirementId,
            revision: r._max.revision ?? 0,
          })),
        },
      })
    : [];
  const evidence = await tx.complianceEvidence.groupBy({
    by: ["requirementId", "requirementVersion"],
    where: {
      ...scope,
      archivedAt: null,
      requirementId: { in: requirementIds },
    },
    _count: { id: true },
  });
  const checklist = buildTrackerChecklist({
    catalogue,
    profile: effectiveProfile,
    sectorOverride: organisationFacts.sector,
    forceStale: profileNeedsSync,
    location: await trackerLocation(
      tx,
      profile?.profile.jurisdictionId ?? null,
    ),
    attestations: rows.map(serializeAttestation),
    evidenceCounts: Object.fromEntries(
      evidence.map((r) => [
        `${r.requirementId}:${r.requirementVersion}`,
        r._count.id,
      ]),
    ),
    now: new Date(),
  });
  return {
    ...checklist,
    profile,
    organisationFacts,
    profileNeedsSync,
  };
}
export function requireApplicableItem(
  checklist: TrackerChecklist,
  id: string,
  version: number,
): TrackerChecklistItem {
  const item = checklist.items.find(
    (item) =>
      item.requirement.id === id && item.requirement.version === version,
  );
  if (!item || item.applicability !== "APPLICABLE")
    throw new BadRequestException(
      "A current applicable requirement and resolved site profile are required",
    );
  return item;
}
