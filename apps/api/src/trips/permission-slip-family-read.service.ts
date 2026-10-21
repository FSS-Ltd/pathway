import { Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { validConsentVersionIds } from "./permission-slip-consent-versions";
import { requireGuardianSlipChild } from "./permission-slip-family-access";
import { parseSlipSnapshot } from "./permission-slip-version";
import type { TripSlipActor } from "./trip-slip-access";

@Injectable()
export class PermissionSlipFamilyReadService {
  async listFamily(
    childId: string,
    query: { cursor?: string; limit: number },
    actor: TripSlipActor,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireGuardianSlipChild(tx, actor, childId, new Date());
      if (query.cursor) {
        const cursor = await tx.permissionSlip.findFirst({
          where: { id: query.cursor, tenantId: actor.tenantId },
          select: { id: true },
        });
        if (!cursor)
          throw new NotFoundException("Permission-slip page not found");
      }
      const slips = await tx.permissionSlip.findMany({
        where: {
          tenantId: actor.tenantId,
          versions: {
            some: {
              publishedAt: { not: null },
              recipients: { some: { childId } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          trip: { select: { cancelledAt: true } },
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              contentSnapshot: true,
              publishedAt: true,
              recipients: {
                where: { childId },
                select: { id: true },
              },
            },
          },
        },
      });
      const items = slips.slice(0, query.limit).flatMap((slip) => {
        const current = slip.versions[0];
        if (!current || current.recipients.length === 0) return [];
        const snapshot = parseSlipSnapshot(current.contentSnapshot);
        return [
          {
            id: slip.id,
            versionId: current.id,
            version: current.version,
            title: snapshot.title,
            tripTitle: snapshot.tripTitle,
            deadlineAt: snapshot.deadlineAt,
            publishedAt: current.publishedAt,
            cancelled: slip.trip.cancelledAt !== null,
          },
        ];
      });
      return {
        items,
        nextCursor:
          slips.length > query.limit ? slips[query.limit - 1].id : null,
      };
    });
  }

  async getFamily(slipId: string, childId: string, actor: TripSlipActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const now = new Date();
      const guardian = await requireGuardianSlipChild(tx, actor, childId, now);
      const slip = await tx.permissionSlip.findFirst({
        where: { id: slipId, tenantId: actor.tenantId },
        select: {
          id: true,
          trip: { select: { cancelledAt: true } },
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { version: "desc" },
            select: {
              id: true,
              version: true,
              versionHash: true,
              contentSnapshot: true,
              publishedAt: true,
              requiresReconsent: true,
              recipients: {
                where: { childId },
                select: { id: true },
              },
            },
          },
        },
      });
      const current = slip?.versions[0];
      if (!slip || !current?.versionHash || current.recipients.length === 0)
        throw new NotFoundException("Permission slip not found");
      const validIds = validConsentVersionIds(slip.versions);
      const [response, exception, olderResponse] = await Promise.all([
        tx.permissionSlipResponse.findFirst({
          where: {
            tenantId: actor.tenantId,
            guardianChildRelationshipId: guardian.relationshipId,
            permissionSlipVersionId: { in: validIds },
          },
          orderBy: { respondedAt: "desc" },
          select: {
            id: true,
            decision: true,
            respondedAt: true,
            permissionSlipVersionId: true,
          },
        }),
        tx.permissionSlipException.findFirst({
          where: {
            tenantId: actor.tenantId,
            childId,
            permissionSlipVersionId: { in: validIds },
          },
          orderBy: { recordedAt: "desc" },
          select: { id: true, decision: true, recordedAt: true },
        }),
        tx.permissionSlipResponse.findFirst({
          where: {
            tenantId: actor.tenantId,
            guardianChildRelationshipId: guardian.relationshipId,
            permissionSlipVersionId: { notIn: validIds },
            permissionSlipVersion: { permissionSlipId: slipId },
          },
          orderBy: { respondedAt: "desc" },
          select: { id: true },
        }),
      ]);
      const snapshot = parseSlipSnapshot(current.contentSnapshot);
      const publicSnapshot = {
        schemaVersion: snapshot.schemaVersion,
        tripTitle: snapshot.tripTitle,
        title: snapshot.title,
        description: snapshot.description,
        destination: snapshot.destination,
        startsAt: snapshot.startsAt,
        endsAt: snapshot.endsAt,
        consentText: snapshot.consentText,
        deadlineAt: snapshot.deadlineAt,
        questions: snapshot.questions,
      };
      const open =
        !slip.trip.cancelledAt &&
        new Date(snapshot.deadlineAt) > now &&
        new Date(snapshot.startsAt) > now;
      return {
        id: slip.id,
        childId,
        versionId: current.id,
        version: current.version,
        versionHash: current.versionHash,
        publishedAt: current.publishedAt,
        snapshot: publicSnapshot,
        response,
        exception,
        needsReconsent: !response && !exception && Boolean(olderResponse),
        onlineResponsesEnabled:
          process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED === "true",
        canRespond:
          open &&
          !response &&
          !exception &&
          process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED === "true",
        closed: !open,
      };
    });
  }
}
