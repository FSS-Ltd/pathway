import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { isAceVertical } from "@pathway/types";
import { siteCalendarDate } from "../homework/homework-audience";
import { parseSlipSnapshot } from "./permission-slip-version";
import type { TripSlipActor } from "./trip-slip-access";

export async function lockCurrentSlip(
  tx: Prisma.TransactionClient,
  slipId: string,
  actor: TripSlipActor,
  expectedVersionId: string,
  expectedVersionHash: string,
  now: Date,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PermissionSlip"
    WHERE "id" = ${slipId} AND "tenantId" = ${actor.tenantId}
    FOR UPDATE
  `;
  if (locked.length !== 1)
    throw new NotFoundException("Permission slip not found");

  const site = await tx.tenant.findFirst({
    where: { id: actor.tenantId, orgId: actor.orgId },
    select: {
      timezone: true,
      org: {
        select: {
          parentPortalEnabled: true,
          orgVertical: { select: { vertical: true } },
        },
      },
    },
  });
  if (!site || !isAceVertical(site.org.orgVertical?.vertical))
    throw new NotFoundException("Permission slip not found");

  const slip = await tx.permissionSlip.findFirst({
    where: { id: slipId, tenantId: actor.tenantId },
    select: {
      trip: { select: { cancelledAt: true } },
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
        select: {
          id: true,
          versionHash: true,
          contentSnapshot: true,
        },
      },
    },
  });
  if (!slip || slip.trip.cancelledAt)
    throw new NotFoundException("Permission slip not found");
  const version = slip.versions[0];
  if (
    !version ||
    version.id !== expectedVersionId ||
    version.versionHash !== expectedVersionHash
  )
    throw new ConflictException("Permission-slip version changed");
  const snapshot = parseSlipSnapshot(version.contentSnapshot);
  if (
    new Date(snapshot.deadlineAt) <= now ||
    new Date(snapshot.startsAt) <= now
  )
    throw new ConflictException("Permission-slip response deadline has passed");
  return {
    site,
    version,
    snapshot,
    today: siteCalendarDate(now, site.timezone),
  };
}
