import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { requireTripSlipStaff, type TripSlipActor } from "./trip-slip-access";
import { parseSlipSnapshot } from "./permission-slip-version";
import {
  auditSlip,
  latestVersion,
  lockSlip,
} from "./permission-slip-internals";
import { publishPermissionSlip } from "./permission-slip-publication";

@Injectable()
export class PermissionSlipVersionService {
  async list(query: { cursor?: string; limit: number }, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      if (query.cursor) {
        const cursor = await tx.permissionSlip.findFirst({
          where: { id: query.cursor, tenantId: actor.tenantId },
          select: { id: true },
        });
        if (!cursor)
          throw new NotFoundException("Permission-slip page not found");
      }
      const rows = await tx.permissionSlip.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          trip: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              cancelledAt: true,
            },
          },
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              publishedAt: true,
              scheduledAt: true,
              requiresReconsent: true,
            },
          },
        },
      });
      return {
        items: rows.slice(0, query.limit),
        nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
      };
    });
  }

  async get(
    slipId: string,
    query: { cursor?: string; limit: number },
    actor: TripSlipActor,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      if (query.cursor) {
        const cursor = await tx.permissionSlipVersion.findFirst({
          where: {
            id: query.cursor,
            tenantId: actor.tenantId,
            permissionSlipId: slipId,
          },
          select: { id: true },
        });
        if (!cursor)
          throw new NotFoundException("Permission-slip version page not found");
      }
      const slip = await tx.permissionSlip.findFirst({
        where: { id: slipId, tenantId: actor.tenantId },
        select: {
          id: true,
          trip: {
            select: {
              id: true,
              title: true,
              destination: true,
              startsAt: true,
              endsAt: true,
              cancelledAt: true,
            },
          },
          versions: {
            orderBy: { version: "desc" },
            take: query.limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            select: {
              id: true,
              version: true,
              contentSnapshot: true,
              versionHash: true,
              changeClassification: true,
              requiresReconsent: true,
              publishedAt: true,
              scheduledAt: true,
              scheduleFailureReason: true,
              updatedAt: true,
              recipients: { select: { childId: true } },
            },
          },
        },
      });
      if (!slip) throw new NotFoundException("Permission slip not found");
      return {
        ...slip,
        versions: slip.versions.slice(0, query.limit),
        nextVersionCursor:
          slip.versions.length > query.limit
            ? slip.versions[query.limit - 1].id
            : null,
      };
    });
  }

  async publish(
    slipId: string,
    versionId: string,
    actor: TripSlipActor,
    scheduled = false,
  ) {
    if (process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED !== "true")
      throw new ServiceUnavailableException(
        "Permission-slip publication is not enabled",
      );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor, true);
      return publishPermissionSlip(tx, slipId, versionId, actor, scheduled);
    });
  }

  async schedule(
    slipId: string,
    versionId: string,
    scheduledAt: Date,
    actor: TripSlipActor,
  ) {
    if (process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED !== "true")
      throw new ServiceUnavailableException(
        "Permission-slip publication is not enabled",
      );
    if (scheduledAt <= new Date())
      throw new ConflictException("Schedule a future publication time");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor, true);
      await lockSlip(tx, actor.tenantId, slipId);
      const latest = await latestVersion(tx, actor.tenantId, slipId);
      if (!latest || latest.id !== versionId || latest.publishedAt)
        throw new ConflictException("Permission-slip draft changed");
      if (latest.scheduledAt)
        throw new ConflictException("Permission slip is already scheduled");
      const trip = await tx.trip.findFirst({
        where: {
          tenantId: actor.tenantId,
          permissionSlip: { id: slipId },
          cancelledAt: null,
        },
        select: { id: true },
      });
      if (!trip) throw new NotFoundException("School trip not found");
      const snapshot = parseSlipSnapshot(latest.contentSnapshot);
      if (
        scheduledAt >= new Date(snapshot.deadlineAt) ||
        scheduledAt >= new Date(snapshot.startsAt)
      )
        throw new ConflictException("Schedule before the consent deadline");
      const version = await tx.permissionSlipVersion.update({
        where: { id_tenantId: { id: versionId, tenantId: actor.tenantId } },
        data: {
          scheduledAt,
          scheduledByUserId: actor.userId,
          scheduleFailureReason: null,
        },
      });
      await auditSlip(tx, actor, slipId, "SCHEDULED");
      return version;
    });
  }

  async cancelSchedule(
    slipId: string,
    versionId: string,
    actor: TripSlipActor,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor, true);
      await lockSlip(tx, actor.tenantId, slipId);
      const version = await tx.permissionSlipVersion.findFirst({
        where: {
          id: versionId,
          permissionSlipId: slipId,
          tenantId: actor.tenantId,
        },
      });
      if (!version) throw new NotFoundException("Permission slip not found");
      if (!version.scheduledAt || version.publishedAt)
        throw new ConflictException("Permission slip is not scheduled");
      const updated = await tx.permissionSlipVersion.update({
        where: { id_tenantId: { id: versionId, tenantId: actor.tenantId } },
        data: { scheduledAt: null, scheduledByUserId: null },
      });
      await auditSlip(tx, actor, slipId, "SCHEDULE_CANCELLED");
      return updated;
    });
  }

  async markScheduleNeedsReview(
    slipId: string,
    versionId: string,
    reason: string,
    actor: TripSlipActor,
  ): Promise<boolean> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await lockSlip(tx, actor.tenantId, slipId);
      const changed = await tx.permissionSlipVersion.updateMany({
        where: {
          id: versionId,
          tenantId: actor.tenantId,
          permissionSlipId: slipId,
          scheduledByUserId: actor.userId,
          scheduledAt: { not: null },
          publishedAt: null,
        },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduleFailureReason: reason,
        },
      });
      if (changed.count === 0) return false;
      await auditSlip(tx, actor, slipId, "SCHEDULE_NEEDS_REVIEW");
      return true;
    });
  }
}
