import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { requireTripSlipStaff, type TripSlipActor } from "./trip-slip-access";
import type { TripInput } from "./trip-slip.dto";

@Injectable()
export class TripsService {
  async list(query: { cursor?: string; limit: number }, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      if (query.cursor) {
        const cursor = await tx.trip.findFirst({
          where: { id: query.cursor, tenantId: actor.tenantId },
          select: { id: true },
        });
        if (!cursor) throw new NotFoundException("School trip page not found");
      }
      const trips = await tx.trip.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          destination: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          permissionSlip: { select: { id: true } },
        },
      });
      return {
        items: trips.slice(0, query.limit),
        nextCursor:
          trips.length > query.limit ? trips[query.limit - 1].id : null,
      };
    });
  }

  async get(tripId: string, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      const trip = await tx.trip.findFirst({
        where: { id: tripId, tenantId: actor.tenantId },
        select: {
          id: true,
          title: true,
          destination: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          cancellationReason: true,
          permissionSlip: { select: { id: true } },
        },
      });
      if (!trip) throw new NotFoundException("School trip not found");
      return trip;
    });
  }

  async create(input: TripInput, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      const trip = await tx.trip.create({
        data: {
          tenantId: actor.tenantId,
          title: input.title,
          destination: input.destination,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          createdByUserId: actor.userId,
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: trip.id,
        action: AuditAction.CREATED,
        metadata: { kind: "trip", state: "DRAFT" },
      });
      return trip;
    });
  }

  async update(tripId: string, input: TripInput, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Trip"
        WHERE "id" = ${tripId} AND "tenantId" = ${actor.tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1)
        throw new NotFoundException("School trip not found");
      const trip = await tx.trip.findFirst({
        where: { id: tripId, tenantId: actor.tenantId },
        select: {
          id: true,
          cancelledAt: true,
          permissionSlip: { select: { id: true } },
        },
      });
      if (!trip) throw new NotFoundException("School trip not found");
      if (trip.cancelledAt) throw new ConflictException("Trip is cancelled");
      if (trip.permissionSlip)
        throw new ConflictException(
          "Edit the permission-slip draft or create a new version to change this trip",
        );
      const updated = await tx.trip.update({
        where: { id_tenantId: { id: tripId, tenantId: actor.tenantId } },
        data: {
          title: input.title,
          destination: input.destination,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: tripId,
        action: AuditAction.UPDATED,
        metadata: { kind: "trip", state: "DRAFT" },
      });
      return updated;
    });
  }

  async cancel(tripId: string, reason: string, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor, true);
      const trip = await tx.trip.findFirst({
        where: { id: tripId, tenantId: actor.tenantId },
        select: {
          id: true,
          cancelledAt: true,
          permissionSlip: { select: { id: true } },
        },
      });
      if (!trip) throw new NotFoundException("School trip not found");
      if (trip.cancelledAt) return trip;
      if (trip.permissionSlip) {
        await tx.$queryRaw`
          SELECT "id" FROM "PermissionSlip"
          WHERE "id" = ${trip.permissionSlip.id} AND "tenantId" = ${actor.tenantId}
          FOR UPDATE
        `;
      }
      const cancelled = await tx.trip.update({
        where: { id_tenantId: { id: tripId, tenantId: actor.tenantId } },
        data: {
          cancelledAt: new Date(),
          cancelledByUserId: actor.userId,
          cancellationReason: reason,
        },
      });
      await tx.permissionSlipVersion.updateMany({
        where: {
          tenantId: actor.tenantId,
          permissionSlip: { tripId },
          publishedAt: null,
          scheduledAt: { not: null },
        },
        data: { scheduledAt: null, scheduledByUserId: null },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: tripId,
        action: AuditAction.UPDATED,
        metadata: { kind: "trip", state: "CANCELLED" },
      });
      return cancelled;
    });
  }
}
