import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { requireTripSlipStaff, type TripSlipActor } from "./trip-slip-access";
import type {
  CreateSlipInput,
  ReviseSlipInput,
  UpdateSlipInput,
} from "./trip-slip.dto";
import {
  classifySlipChange,
  makeSlipSnapshot,
  parseSlipSnapshot,
} from "./permission-slip-version";
import {
  auditSlip,
  latestVersion,
  lockSlip,
} from "./permission-slip-internals";

@Injectable()
export class PermissionSlipDraftService {
  async create(input: CreateSlipInput, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Trip"
        WHERE "id" = ${input.tripId} AND "tenantId" = ${actor.tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1)
        throw new NotFoundException("School trip not found");
      const trip = await tx.trip.findFirst({
        where: { id: input.tripId, tenantId: actor.tenantId },
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
      if (!trip) throw new NotFoundException("School trip not found");
      if (trip.cancelledAt) throw new ConflictException("Trip is cancelled");
      if (trip.permissionSlip)
        throw new ConflictException("Trip already has a permission slip");
      const snapshot = makeSlipSnapshot(trip, input);
      if (new Date(snapshot.deadlineAt) > trip.startsAt)
        throw new ConflictException("Consent deadline must precede the trip");
      const slip = await tx.permissionSlip.create({
        data: {
          tenantId: actor.tenantId,
          tripId: trip.id,
          createdByUserId: actor.userId,
          versions: {
            create: {
              version: 1,
              contentSnapshot: snapshot,
              createdByUserId: actor.userId,
            },
          },
        },
        select: { id: true, versions: { select: { id: true } } },
      });
      await auditSlip(tx, actor, slip.id, "DRAFT_CREATED");
      return slip;
    });
  }

  async updateDraft(
    slipId: string,
    input: UpdateSlipInput,
    actor: TripSlipActor,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      await lockSlip(tx, actor.tenantId, slipId);
      const slip = await tx.permissionSlip.findFirst({
        where: {
          id: slipId,
          tenantId: actor.tenantId,
          trip: { cancelledAt: null },
        },
        select: { tripId: true },
      });
      if (!slip) throw new NotFoundException("School trip not found");
      const version = await latestVersion(tx, actor.tenantId, slipId);
      if (!version || version.publishedAt)
        throw new ConflictException("No editable permission-slip draft");
      if (version.scheduledAt)
        throw new ConflictException("Cancel the schedule before editing");
      if (
        version.updatedAt.getTime() !==
        new Date(input.expectedUpdatedAt).getTime()
      )
        throw new ConflictException("Permission-slip draft changed");
      const previous = parseSlipSnapshot(version.contentSnapshot);
      const snapshot = makeSlipSnapshot(
        input.trip
          ? {
              title: input.trip.title,
              destination: input.trip.destination,
              startsAt: new Date(input.trip.startsAt),
              endsAt: new Date(input.trip.endsAt),
            }
          : {
              title: previous.tripTitle,
              destination: previous.destination,
              startsAt: new Date(previous.startsAt),
              endsAt: new Date(previous.endsAt),
            },
        input,
        previous,
      );
      if (new Date(snapshot.deadlineAt) > new Date(snapshot.startsAt))
        throw new ConflictException("Consent deadline must precede the trip");
      const superseded = version.supersedesVersionId
        ? await tx.permissionSlipVersion.findFirst({
            where: {
              id: version.supersedesVersionId,
              tenantId: actor.tenantId,
              permissionSlipId: slipId,
              publishedAt: { not: null },
            },
            select: { contentSnapshot: true },
          })
        : null;
      const classification = superseded
        ? classifySlipChange(
            parseSlipSnapshot(superseded.contentSnapshot),
            snapshot,
          )
        : "INITIAL";
      const updated = await tx.permissionSlipVersion.update({
        where: { id_tenantId: { id: version.id, tenantId: actor.tenantId } },
        data: {
          contentSnapshot: snapshot,
          changeClassification: classification,
          requiresReconsent: classification === "MATERIAL",
          scheduleFailureReason: null,
        },
      });
      if (!version.supersedesVersionId) {
        await tx.trip.update({
          where: {
            id_tenantId: { id: slip.tripId, tenantId: actor.tenantId },
          },
          data: {
            title: snapshot.tripTitle,
            destination: snapshot.destination,
            startsAt: new Date(snapshot.startsAt),
            endsAt: new Date(snapshot.endsAt),
          },
        });
      }
      await auditSlip(tx, actor, slipId, "DRAFT_UPDATED");
      return updated;
    });
  }

  async revise(slipId: string, input: ReviseSlipInput, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireTripSlipStaff(tx, actor);
      await lockSlip(tx, actor.tenantId, slipId);
      const latest = await latestVersion(tx, actor.tenantId, slipId);
      if (
        !latest ||
        latest.id !== input.expectedVersionId ||
        !latest.publishedAt
      )
        throw new ConflictException(
          "Published permission-slip version changed",
        );
      const trip = await tx.trip.findFirst({
        where: {
          tenantId: actor.tenantId,
          permissionSlip: { id: slipId },
          cancelledAt: null,
        },
        select: { id: true },
      });
      if (!trip) throw new NotFoundException("School trip not found");
      const previous = parseSlipSnapshot(latest.contentSnapshot);
      const tripDetails = input.trip
        ? {
            title: input.trip.title,
            destination: input.trip.destination,
            startsAt: new Date(input.trip.startsAt),
            endsAt: new Date(input.trip.endsAt),
          }
        : {
            title: previous.tripTitle,
            destination: previous.destination,
            startsAt: new Date(previous.startsAt),
            endsAt: new Date(previous.endsAt),
          };
      const snapshot = makeSlipSnapshot(tripDetails, input, previous);
      if (new Date(snapshot.deadlineAt) > tripDetails.startsAt)
        throw new ConflictException("Consent deadline must precede the trip");
      const classification = classifySlipChange(previous, snapshot);
      if (JSON.stringify(previous) === JSON.stringify(snapshot))
        throw new ConflictException("Permission slip has no changes");
      const version = await tx.permissionSlipVersion.create({
        data: {
          tenantId: actor.tenantId,
          permissionSlipId: slipId,
          version: latest.version + 1,
          contentSnapshot: snapshot,
          changeClassification: classification,
          requiresReconsent: classification === "MATERIAL",
          supersedesVersionId: latest.id,
          createdByUserId: actor.userId,
        },
      });
      await auditSlip(tx, actor, slipId, "REVISION_DRAFTED");
      return version;
    });
  }
}
