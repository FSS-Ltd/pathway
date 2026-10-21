import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { siteCalendarDate } from "../homework/homework-audience";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { TripSlipActor } from "./trip-slip-access";
import { parseSlipSnapshot, slipVersionHash } from "./permission-slip-version";

export async function publishPermissionSlip(
  tx: Prisma.TransactionClient,
  slipId: string,
  versionId: string,
  actor: TripSlipActor,
  scheduled: boolean,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PermissionSlip"
    WHERE "id" = ${slipId} AND "tenantId" = ${actor.tenantId}
    FOR UPDATE
  `;
  if (locked.length !== 1)
    throw new NotFoundException("Permission slip not found");
  const slip = await tx.permissionSlip.findFirst({
    where: { id: slipId, tenantId: actor.tenantId },
    select: {
      trip: {
        select: { id: true, cancelledAt: true },
      },
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!slip || slip.trip.cancelledAt)
    throw new NotFoundException("Permission slip not found");
  const version = slip.versions[0];
  if (!version || version.id !== versionId)
    throw new ConflictException("Permission-slip version changed");
  if (version.publishedAt) return version;
  if (
    scheduled
      ? !version.scheduledAt ||
        version.scheduledAt > new Date() ||
        version.scheduledByUserId !== actor.userId
      : version.scheduledAt !== null
  ) {
    throw new ConflictException("Permission-slip publication changed");
  }
  if (version.supersedesVersionId) {
    const previous = await tx.permissionSlipVersion.findFirst({
      where: {
        id: version.supersedesVersionId,
        tenantId: actor.tenantId,
        permissionSlipId: slipId,
        publishedAt: { not: null },
      },
      select: { id: true },
    });
    if (!previous)
      throw new ConflictException("Published permission-slip version changed");
  }
  const snapshot = parseSlipSnapshot(version.contentSnapshot);
  const now = new Date();
  if (
    new Date(snapshot.deadlineAt) <= now ||
    new Date(snapshot.startsAt) <= now ||
    new Date(snapshot.deadlineAt) > new Date(snapshot.startsAt)
  ) {
    throw new ConflictException("Trip or consent deadline has passed");
  }
  const site = await tx.tenant.findFirst({
    where: { id: actor.tenantId, orgId: actor.orgId },
    select: { timezone: true },
  });
  if (!site) throw new NotFoundException("School trip not found");
  const today = siteCalendarDate(now, site.timezone);
  const enrolled = await tx.aceSchoolEnrollment.findMany({
    where: {
      tenantId: actor.tenantId,
      childId: { in: snapshot.recipientChildIds },
      startsOn: { lte: today },
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
      child: { isGuest: false },
    },
    select: { childId: true },
  });
  if (
    new Set(enrolled.map((row) => row.childId)).size !==
    snapshot.recipientChildIds.length
  ) {
    throw new ConflictException(
      "One or more trip recipients are no longer enrolled",
    );
  }
  await tx.permissionSlipRecipient.createMany({
    data: snapshot.recipientChildIds.map((childId) => ({
      tenantId: actor.tenantId,
      permissionSlipVersionId: version.id,
      childId,
    })),
  });
  await tx.trip.update({
    where: { id_tenantId: { id: slip.trip.id, tenantId: actor.tenantId } },
    data: {
      title: snapshot.tripTitle,
      destination: snapshot.destination,
      startsAt: new Date(snapshot.startsAt),
      endsAt: new Date(snapshot.endsAt),
    },
  });
  const published = await tx.permissionSlipVersion.update({
    where: { id_tenantId: { id: version.id, tenantId: actor.tenantId } },
    data: {
      versionHash: slipVersionHash(snapshot),
      publishedAt: now,
      publishedByUserId: actor.userId,
      scheduledAt: null,
      scheduledByUserId: null,
      scheduleFailureReason: null,
    },
  });
  await recordAuditEventInTransaction(tx, {
    actorUserId: actor.userId,
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    entityType: AuditEntityType.ACE_RECORD,
    entityId: slipId,
    action: AuditAction.UPDATED,
    metadata: {
      kind: "permission_slip",
      state: "PUBLISHED",
      versionId: version.id,
      classification: version.changeClassification,
    },
  });
  return published;
}
