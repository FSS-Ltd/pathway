import { ConflictException } from "@nestjs/common";
import { localDateAt } from "../billing/institutional/institutional-time";
import {
  isEnrolledOn,
  validatePeriods,
  type EnrolmentPeriod,
} from "./enrolment-periods";

export type DeclaredCapacityPolicy = {
  timezone: string;
  declaredCapacity: number | null;
  scheduledCapacityDecrease: number | null;
  scheduledCapacityEffectiveAt: Date | null;
};

type EnrolmentRevisionPeriods = {
  identityId: string;
  periods: unknown;
};

export function assertDeclaredCapacityForEnrolment(
  identityId: string,
  nextPeriods: EnrolmentPeriod[],
  policy: DeclaredCapacityPolicy,
  revisions: EnrolmentRevisionPeriods[],
): void {
  if (policy.declaredCapacity === null) {
    throw new ConflictException({
      code: "DECLARED_CAPACITY_UNCONFIGURED",
      route: "/billing/institutional",
      message: "Declared capacity is not configured for this organisation.",
    });
  }

  const latestPeriods = new Map<string, EnrolmentPeriod[]>();
  for (const revision of revisions) {
    if (!latestPeriods.has(revision.identityId)) {
      latestPeriods.set(revision.identityId, validatePeriods(revision.periods));
    }
  }
  const proposedPeriods = new Map(latestPeriods);
  proposedPeriods.set(identityId, nextPeriods);

  const today = localDateAt(new Date(), policy.timezone);
  const policyDecreaseOn =
    policy.scheduledCapacityDecrease !== null &&
    policy.scheduledCapacityEffectiveAt !== null
      ? localDateAt(policy.scheduledCapacityEffectiveAt, policy.timezone)
      : null;
  const effectiveDates = new Set([today]);
  for (const periods of proposedPeriods.values()) {
    for (const period of periods) {
      if (period.admittedOn >= today) effectiveDates.add(period.admittedOn);
    }
  }
  if (policyDecreaseOn && policyDecreaseOn >= today) {
    effectiveDates.add(policyDecreaseOn);
  }

  const dates = [...effectiveDates].sort();
  const existingCounts = enrollmentCountsByDate(latestPeriods, dates, today);
  const proposedCounts = enrollmentCountsByDate(proposedPeriods, dates, today);

  for (const effectiveOn of dates) {
    const existingCount = existingCounts.get(effectiveOn) ?? 0;
    const proposedCount = proposedCounts.get(effectiveOn) ?? 0;
    const capacity =
      policyDecreaseOn &&
      policy.scheduledCapacityDecrease !== null &&
      effectiveOn >= policyDecreaseOn
        ? policy.scheduledCapacityDecrease
        : policy.declaredCapacity;

    // Existing over-cap data may still be reduced or corrected, but a change
    // cannot add more active children beyond the purchased capacity.
    if (proposedCount > capacity && proposedCount > existingCount) {
      throw new ConflictException({
        code: "DECLARED_CAPACITY_REACHED",
        route: "/billing/institutional",
        declaredCapacity: capacity,
        enrolledCount: proposedCount,
        effectiveOn,
        message:
          "Declared child capacity would be exceeded. Increase capacity before activating this enrolment.",
      });
    }
  }
}

function enrollmentCountsByDate(
  periodsByIdentity: Map<string, EnrolmentPeriod[]>,
  dates: string[],
  today: string,
): Map<string, number> {
  const changes = new Map<string, number>();
  let count = 0;
  for (const periods of periodsByIdentity.values()) {
    if (isEnrolledOn(periods, today)) count += 1;
    for (const period of periods) {
      if (period.admittedOn > today) {
        changes.set(
          period.admittedOn,
          (changes.get(period.admittedOn) ?? 0) + 1,
        );
      }
      if (period.leftOn && period.leftOn > today) {
        changes.set(period.leftOn, (changes.get(period.leftOn) ?? 0) - 1);
      }
    }
  }

  const counts = new Map<string, number>();
  for (const date of dates) {
    if (date > today) count += changes.get(date) ?? 0;
    counts.set(date, count);
  }
  return counts;
}
