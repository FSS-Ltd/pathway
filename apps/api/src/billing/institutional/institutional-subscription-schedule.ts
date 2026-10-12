import Stripe from "stripe";
import {
  copySchedulePhase,
  type ScheduledItem,
} from "../module-change-schedule";

type Phase = Stripe.SubscriptionScheduleUpdateParams.Phase;

/** Replace only a phase created by institutional billing; leave manual future phases for review. */
export function institutionalRenewalPhases(
  schedule: Stripe.SubscriptionSchedule,
  effectiveAt: number,
  items: ScheduledItem[],
  planCode: string,
  snapshotId: string,
  now = Math.floor(Date.now() / 1000),
): Phase[] {
  const phases = schedule.phases.filter((phase) => phase.end_date > now);
  const existingIndex = phases.findIndex(
    (phase) => phase.start_date === effectiveAt,
  );
  if (existingIndex >= 0) {
    const existing = phases[existingIndex];
    if (
      !existing.metadata?.institutionalSnapshotId ||
      phases.some((phase) => phase.start_date > effectiveAt)
    ) {
      throw new Error("Existing renewal phase requires billing review");
    }
    const updated = phases.map(copySchedulePhase);
    updated[existingIndex].items = items;
    updated[existingIndex].metadata = {
      ...existing.metadata,
      planCode,
      institutionalSnapshotId: snapshotId,
    };
    return updated;
  }
  if (phases.some((phase) => phase.start_date > effectiveAt)) {
    throw new Error("Later subscription phase requires billing review");
  }
  const currentIndex = phases.findIndex(
    (phase) => phase.start_date < effectiveAt && effectiveAt < phase.end_date,
  );
  const result = phases.map(copySchedulePhase);
  if (currentIndex >= 0) {
    const current = phases[currentIndex];
    result[currentIndex].end_date = effectiveAt;
    result.splice(currentIndex + 1, 0, {
      ...copySchedulePhase(current),
      start_date: effectiveAt,
      items,
      metadata: {
        ...current.metadata,
        planCode,
        institutionalSnapshotId: snapshotId,
      },
    });
    return result;
  }
  const last = phases[phases.length - 1];
  if (!last || last.end_date !== effectiveAt) {
    throw new Error("Renewal falls outside the current subscription schedule");
  }
  const next = copySchedulePhase(last);
  delete next.end_date;
  result.push({
    ...next,
    start_date: effectiveAt,
    iterations: 1,
    items,
    metadata: {
      ...last.metadata,
      planCode,
      institutionalSnapshotId: snapshotId,
    },
  });
  return result;
}

export async function scheduleInstitutionalRenewal(
  stripe: Stripe,
  subscriptionId: string,
  effectiveAt: Date,
  items: ScheduledItem[],
  snapshotId: string,
  planCode: string,
): Promise<string> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const scheduleId = subscription.schedule
    ? typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule.id
    : null;
  const schedule = scheduleId
    ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : await stripe.subscriptionSchedules.create(
        { from_subscription: subscriptionId },
        { idempotencyKey: `institutional-schedule-create:${snapshotId}` },
      );
  await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      phases: institutionalRenewalPhases(
        schedule,
        Math.floor(effectiveAt.getTime() / 1000),
        items,
        planCode,
        snapshotId,
      ),
      end_behavior: schedule.end_behavior,
      proration_behavior: "none",
    },
    { idempotencyKey: `institutional-schedule-update:${snapshotId}` },
  );
  return schedule.id;
}
