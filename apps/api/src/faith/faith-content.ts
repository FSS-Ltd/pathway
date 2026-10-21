import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import {
  faithAudienceSchema,
  faithPayloadSchema,
  type FaithAudience,
} from "./faith.dto";
import type { FaithActor } from "./faith-access";

export const authoringEnabled = () =>
  process.env.ACE_FAITH_AUTHORING_ENABLED === "true";
export const publicationEnabled = () =>
  process.env.ACE_FAITH_PUBLICATION_ENABLED === "true";

export function tryUnpackDraftPayload(value: unknown): {
  contentPayload: {
    body: string;
    sourceLabel?: string;
    sourceUrl?: string;
    reflectionPrompt?: string;
  };
  audience: FaithAudience;
} | null {
  const parsed = faithPayloadSchema
    .extend({ audience: faithAudienceSchema })
    .safeParse(value);
  if (!parsed.success) return null;
  const { audience, ...contentPayload } = parsed.data;
  return { contentPayload, audience };
}

export function unpackDraftPayload(
  value: unknown,
): NonNullable<ReturnType<typeof tryUnpackDraftPayload>> {
  const parsed = tryUnpackDraftPayload(value);
  if (!parsed) throw new ConflictException("Faith draft content needs review");
  return parsed;
}

export async function latestFaithVersion(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  contentId: string,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "FaithContent"
    WHERE "id" = ${contentId} AND "tenantId" = ${actor.tenantId}
    FOR UPDATE
  `;
  if (locked.length !== 1)
    throw new NotFoundException("Faith content not found");
  return tx.faithContentVersion.findFirst({
    where: { tenantId: actor.tenantId, faithContentId: contentId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
}

export function requireExpectedVersion(
  actual: { id: string } | null,
  expected: string | null,
): void {
  if ((actual?.id ?? null) !== expected) {
    throw new ConflictException("Faith content changed before publication");
  }
}

export async function validateFaithAudience(
  tx: Prisma.TransactionClient,
  tenantId: string,
  audience: FaithAudience,
) {
  if (audience.type === "ALL_ACTIVE_STUDENTS") return [];
  const bands = await tx.faithAgeBand.findMany({
    where: { tenantId, id: { in: audience.ageBandIds }, archivedAt: null },
    select: { id: true, name: true, minimumAge: true, maximumAge: true },
  });
  if (bands.length !== audience.ageBandIds.length) {
    throw new ConflictException("An age band changed before publication");
  }
  return bands;
}

export async function auditFaith(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  entityId: string,
  action: AuditAction,
  state: string,
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    actorUserId: actor.userId,
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    entityType: AuditEntityType.ACE_RECORD,
    entityId,
    action,
    metadata: { kind: "faith_content", state },
  });
}
