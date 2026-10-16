import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  applyTenantContext,
  AuditAction,
  AuditEntityType,
  Prisma,
  prisma,
  withOrgRlsContext,
} from "@pathway/db";
import {
  admitChild,
  assertDate,
  isEnrolledOn,
  leaveChild,
  validatePeriods,
  type EnrolmentPeriod,
} from "./enrolment-periods";
import {
  DECLARED_CAPACITY_PRICING_VERSION,
  isDeclaredCapacityPlanCode,
} from "@pathway/pricing";
import { assertDeclaredCapacityForEnrolment } from "./declared-capacity-enforcement";

async function lockOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<Date> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ENROLMENT:${orgId}`}, 0))`;
  // Timestamp(3) stores milliseconds. Keep ordered operations distinct even
  // when an admission, confirmation and departure land in the same millisecond.
  const rows = await tx.$queryRaw<{ recordedAt: Date }[]>`
    SELECT GREATEST(
      clock_timestamp() AT TIME ZONE 'UTC',
      COALESCE((SELECT max("recordedAt") FROM "EnrolmentRevision" WHERE "orgId" = ${orgId}), 'epoch'::timestamp) + interval '1 millisecond',
      COALESCE((SELECT max("revisionCutoff") FROM "EnrolmentRollConfirmation" WHERE "orgId" = ${orgId}), 'epoch'::timestamp) + interval '1 millisecond'
    ) AS "recordedAt"`;
  return rows[0].recordedAt;
}

async function rollAt(
  tx: Prisma.TransactionClient,
  orgId: string,
  effectiveOn: string,
  revisionCutoff?: Date,
): Promise<string[]> {
  const revisions = await tx.enrolmentRevision.findMany({
    where: {
      orgId,
      ...(revisionCutoff ? { recordedAt: { lte: revisionCutoff } } : {}),
    },
    orderBy: [{ identityId: "asc" }, { version: "desc" }],
    select: { identityId: true, periods: true },
  });
  const seen = new Set<string>();
  const enrolled: string[] = [];
  for (const revision of revisions) {
    if (seen.has(revision.identityId)) continue;
    seen.add(revision.identityId);
    if (isEnrolledOn(validatePeriods(revision.periods), effectiveOn)) {
      enrolled.push(revision.identityId);
    }
  }
  return enrolled;
}

@Injectable()
export class EnrolmentRollService {
  async recordChange(
    orgId: string,
    identityId: string,
    actorUserId: string,
    action: "admit" | "leave" | "reenrol" | "correct",
    date: string | undefined,
    correctedPeriods: unknown,
    reason: string,
  ) {
    const cleanReason = reason.trim();
    if (!cleanReason || cleanReason.length > 500)
      throw new BadRequestException("Reason is required.");
    if (action === "correct" && correctedPeriods === undefined) {
      throw new BadRequestException("Corrected periods are required.");
    }
    return prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      const recordedAt = await lockOrg(tx, orgId);
      const org = await tx.org.findUnique({
        where: { id: orgId },
        select: {
          isMasterOrg: true,
          institutionalBillingPolicy: {
            select: {
              pricingVersion: true,
              timezone: true,
              declaredCapacity: true,
              scheduledCapacityDecrease: true,
              scheduledCapacityEffectiveAt: true,
            },
          },
          subscriptions: {
            where: { planCode: { not: { startsWith: "ADD_ON:" } } },
            orderBy: [{ periodEnd: "desc" }],
            take: 1,
            select: { planCode: true },
          },
        },
      });
      const policy = org?.institutionalBillingPolicy;
      const isDeclaredCapacityOrg =
        policy?.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION ||
        isDeclaredCapacityPlanCode(org?.subscriptions[0]?.planCode ?? "");
      const identity = await tx.orgChildIdentity.findFirst({
        where: { id: identityId, orgId, siteLinks: { some: {} } },
        select: { id: true },
      });
      if (!identity)
        throw new NotFoundException("Linked child identity not found.");
      const latest = await tx.enrolmentRevision.findFirst({
        where: { orgId, identityId },
        orderBy: { version: "desc" },
        select: { version: true, periods: true },
      });
      const periods: EnrolmentPeriod[] = latest
        ? validatePeriods(latest.periods)
        : [];
      let next: EnrolmentPeriod[];
      if (action === "correct") {
        next = validatePeriods(correctedPeriods);
      } else {
        if (!date) throw new BadRequestException("Date is required.");
        if (action === "admit" && periods.length > 0) {
          throw new BadRequestException(
            "Use re-enrolment after a previous admission.",
          );
        }
        if (action === "reenrol" && periods.length === 0) {
          throw new BadRequestException("No previous admission exists.");
        }
        next =
          action === "leave"
            ? leaveChild(periods, date)
            : admitChild(periods, date);
      }
      if (
        org &&
        !org.isMasterOrg &&
        isDeclaredCapacityOrg &&
        action !== "leave"
      ) {
        if (
          !policy ||
          policy.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION
        ) {
          throw new ConflictException({
            code: "DECLARED_CAPACITY_UNCONFIGURED",
            route: "/billing/institutional",
            message:
              "Declared capacity is not configured for this organisation.",
          });
        }
        const revisions = await tx.enrolmentRevision.findMany({
          where: { orgId },
          orderBy: [{ identityId: "asc" }, { version: "desc" }],
          select: { identityId: true, periods: true },
        });
        assertDeclaredCapacityForEnrolment(identityId, next, policy, revisions);
      }
      const revision = await tx.enrolmentRevision.create({
        data: {
          orgId,
          identityId,
          version: (latest?.version ?? 0) + 1,
          periods: next,
          reason: cleanReason,
          actorUserId,
          recordedAt,
        },
        select: {
          id: true,
          identityId: true,
          version: true,
          periods: true,
          recordedAt: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          orgId,
          actorUserId,
          entityType: AuditEntityType.ENROLMENT,
          entityId: identityId,
          action:
            action === "admit" ? AuditAction.CREATED : AuditAction.UPDATED,
          metadata: { action, version: revision.version, reason: cleanReason },
        },
      });
      return revision;
    });
  }

  async roll(orgId: string, effectiveOn: string, revisionCutoff?: Date) {
    assertDate(effectiveOn);
    return withOrgRlsContext(orgId, async (tx) => {
      const cutoff =
        revisionCutoff ??
        (
          await tx.enrolmentRevision.findFirst({
            where: { orgId },
            orderBy: { recordedAt: "desc" },
            select: { recordedAt: true },
          })
        )?.recordedAt ??
        new Date();
      const identities = await rollAt(tx, orgId, effectiveOn, cutoff);
      return {
        effectiveOn,
        revisionCutoff: cutoff,
        enrolledCount: identities.length,
      };
    });
  }

  async confirmRoll(
    orgId: string,
    actorUserId: string,
    effectiveOn: string,
    acknowledgeEmpty: boolean,
  ) {
    assertDate(effectiveOn);
    return prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      const revisionCutoff = await lockOrg(tx, orgId);
      const identityIds = await rollAt(tx, orgId, effectiveOn, revisionCutoff);
      if (identityIds.length === 0 && !acknowledgeEmpty) {
        throw new ConflictException(
          "Explicitly acknowledge an empty roll before confirmation.",
        );
      }
      const confirmation = await tx.enrolmentRollConfirmation.create({
        data: {
          orgId,
          effectiveOn: new Date(`${effectiveOn}T00:00:00.000Z`),
          revisionCutoff,
          identityIds,
          enrolledCount: identityIds.length,
          confirmerUserId: actorUserId,
        },
        select: {
          id: true,
          effectiveOn: true,
          revisionCutoff: true,
          enrolledCount: true,
          confirmedAt: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          orgId,
          actorUserId,
          entityType: AuditEntityType.ENROLMENT_ROLL,
          entityId: confirmation.id,
          action: AuditAction.CREATED,
          metadata: { effectiveOn, enrolledCount: identityIds.length },
        },
      });
      return confirmation;
    });
  }

  async latestConfirmation(orgId: string) {
    return withOrgRlsContext(orgId, (tx) =>
      tx.enrolmentRollConfirmation.findFirst({
        where: { orgId },
        orderBy: { confirmedAt: "desc" },
        select: {
          id: true,
          effectiveOn: true,
          revisionCutoff: true,
          enrolledCount: true,
          confirmedAt: true,
        },
      }),
    );
  }
}
