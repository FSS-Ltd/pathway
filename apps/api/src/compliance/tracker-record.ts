import { z } from "zod";
import type { Prisma } from "@pathway/db";
import {
  TRACKER_TOPICS,
  type TrackerProfile,
  type TrackerAttestation,
  type TrackerRequirement,
  type TrackerEvidence,
} from "@pathway/types";
import { normalizeTrackerProfile } from "./tracker.dto";
const requirementSnapshotSchema: z.ZodType<TrackerRequirement> = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  action: z.string(),
  topic: z.enum(TRACKER_TOPICS),
  obligationClass: z.enum([
    "STATUTORY_DUTY",
    "STATUTORY_GUIDANCE",
    "RECOMMENDATION",
    "PROVIDER_REQUIREMENT",
  ]),
  applicabilityExplanation: z.string(),
  unknownExplanation: z.string(),
  expectedEvidence: z.array(z.string()),
  allowsNotApplicable: z.boolean(),
  sources: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      title: z.string(),
      authority: z.string(),
      provision: z.string(),
    }),
  ),
  signalKeys: z.array(
    z.enum([
      "personnel",
      "agreements",
      "attendance",
      "medical",
      "safeguarding",
      "trips",
      "ace",
    ]),
  ),
});
export function serializeTrackerProfile(
  row: Prisma.ComplianceSiteProfileGetPayload<Record<string, never>>,
): TrackerProfile {
  return {
    profile: normalizeTrackerProfile(JSON.parse(row.profileJson)),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function serializeAttestation(
  row: Prisma.ComplianceAttestationGetPayload<Record<string, never>>,
): TrackerAttestation {
  return {
    id: row.id,
    requirementId: row.requirementId,
    requirementVersion: row.requirementVersion,
    profileVersion: row.profileVersion,
    revision: row.revision,
    requirement: requirementSnapshotSchema.parse(
      JSON.parse(row.requirementJson),
    ),
    status: row.status,
    notes: row.notes,
    notApplicableReason: row.notApplicableReason,
    reviewDueAt: row.reviewDueAt?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
  };
}
export function serializeTrackerEvidence(
  row: Prisma.ComplianceEvidenceGetPayload<Record<string, never>>,
): TrackerEvidence {
  return {
    id: row.id,
    requirementId: row.requirementId,
    requirementVersion: row.requirementVersion,
    title: row.title,
    notes: row.notes,
    fileName: row.fileName,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
