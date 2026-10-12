import Stripe from "stripe";

export type ScheduledItem = { price: string; quantity: number };

const idOf = (value: string | { id: string }): string =>
  typeof value === "string" ? value : value.id;

type UpdatePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

function copyDiscounts(
  discounts: Stripe.SubscriptionSchedule.Phase.Discount[],
): Stripe.SubscriptionScheduleUpdateParams.Phase.Discount[] {
  return discounts.map((entry) => ({
    ...(entry.coupon ? { coupon: idOf(entry.coupon) } : {}),
    ...(entry.discount ? { discount: idOf(entry.discount) } : {}),
    ...(entry.promotion_code
      ? { promotion_code: idOf(entry.promotion_code) }
      : {}),
  }));
}

/** Stripe replaces the complete phases array on update, so copy every retained setting. */
export function copySchedulePhase(
  phase: Stripe.SubscriptionSchedule.Phase,
): UpdatePhase {
  return {
    start_date: phase.start_date,
    end_date: phase.end_date,
    items: phase.items.map((item) => ({
      price: idOf(item.price),
      ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
      ...(item.billing_thresholds?.usage_gte !== null &&
      item.billing_thresholds?.usage_gte !== undefined
        ? {
            billing_thresholds: {
              usage_gte: item.billing_thresholds.usage_gte,
            },
          }
        : {}),
      ...(item.discounts.length
        ? { discounts: copyDiscounts(item.discounts) }
        : {}),
      ...(item.metadata ? { metadata: item.metadata } : {}),
      ...(item.tax_rates ? { tax_rates: item.tax_rates.map(idOf) } : {}),
    })),
    ...(phase.add_invoice_items.length
      ? {
          add_invoice_items: phase.add_invoice_items.map((item) => ({
            price: idOf(item.price),
            ...(item.quantity !== null ? { quantity: item.quantity } : {}),
            ...(item.discounts.length
              ? { discounts: copyDiscounts(item.discounts) }
              : {}),
            ...(item.tax_rates ? { tax_rates: item.tax_rates.map(idOf) } : {}),
          })),
        }
      : {}),
    ...(phase.application_fee_percent !== null
      ? { application_fee_percent: phase.application_fee_percent }
      : {}),
    ...(phase.automatic_tax
      ? {
          automatic_tax: {
            enabled: phase.automatic_tax.enabled,
            ...(phase.automatic_tax.liability
              ? {
                  liability: {
                    type: phase.automatic_tax.liability.type,
                    ...(phase.automatic_tax.liability.account
                      ? {
                          account: idOf(phase.automatic_tax.liability.account),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(phase.billing_cycle_anchor
      ? { billing_cycle_anchor: phase.billing_cycle_anchor }
      : {}),
    ...(phase.billing_thresholds
      ? {
          billing_thresholds: {
            ...(phase.billing_thresholds.amount_gte !== null
              ? {
                  amount_gte: phase.billing_thresholds.amount_gte,
                }
              : {}),
            ...(phase.billing_thresholds.reset_billing_cycle_anchor !== null
              ? {
                  reset_billing_cycle_anchor:
                    phase.billing_thresholds.reset_billing_cycle_anchor,
                }
              : {}),
          },
        }
      : {}),
    ...(phase.collection_method
      ? { collection_method: phase.collection_method }
      : {}),
    ...(phase.coupon ? { coupon: idOf(phase.coupon) } : {}),
    currency: phase.currency,
    ...(phase.default_payment_method
      ? { default_payment_method: idOf(phase.default_payment_method) }
      : {}),
    ...(phase.default_tax_rates
      ? { default_tax_rates: phase.default_tax_rates.map(idOf) }
      : {}),
    ...(phase.description ? { description: phase.description } : {}),
    ...(phase.discounts.length
      ? { discounts: copyDiscounts(phase.discounts) }
      : {}),
    ...(phase.invoice_settings
      ? {
          invoice_settings: {
            ...(phase.invoice_settings.account_tax_ids
              ? {
                  account_tax_ids:
                    phase.invoice_settings.account_tax_ids.map(idOf),
                }
              : {}),
            ...(phase.invoice_settings.days_until_due !== null
              ? {
                  days_until_due: phase.invoice_settings.days_until_due,
                }
              : {}),
            ...(phase.invoice_settings.issuer
              ? {
                  issuer: {
                    type: phase.invoice_settings.issuer.type,
                    ...(phase.invoice_settings.issuer.account
                      ? {
                          account: idOf(phase.invoice_settings.issuer.account),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(phase.metadata ? { metadata: phase.metadata } : {}),
    ...(phase.on_behalf_of ? { on_behalf_of: idOf(phase.on_behalf_of) } : {}),
    proration_behavior: "none",
    ...(phase.transfer_data
      ? {
          transfer_data: {
            destination: idOf(phase.transfer_data.destination),
            ...(phase.transfer_data.amount_percent !== null
              ? {
                  amount_percent: phase.transfer_data.amount_percent,
                }
              : {}),
          },
        }
      : {}),
    ...(phase.trial_end ? { trial_end: phase.trial_end } : {}),
  };
}

export function phasesForRenewal(
  schedule: Stripe.SubscriptionSchedule,
  effectiveAt: number,
  items: ScheduledItem[],
  planCode: string,
): UpdatePhase[] {
  const phases = schedule.phases.filter(
    (phase) => phase.end_date > Math.floor(Date.now() / 1000),
  );
  const scheduledAtRenewal = phases.find(
    (phase) => phase.start_date === effectiveAt,
  );
  if (scheduledAtRenewal) {
    const scheduledItems = scheduledAtRenewal.items.map((item) => ({
      price: idOf(item.price),
      quantity: item.quantity ?? 1,
    }));
    const sameItems =
      JSON.stringify(
        [...scheduledItems].sort((a, b) => a.price.localeCompare(b.price)),
      ) ===
      JSON.stringify([...items].sort((a, b) => a.price.localeCompare(b.price)));
    if (
      sameItems &&
      scheduledAtRenewal.metadata?.planCode === planCode &&
      phases[phases.length - 1] === scheduledAtRenewal
    ) {
      return phases.map(copySchedulePhase);
    }
    throw new Error(
      "A different transition is already scheduled for this renewal",
    );
  }
  if (phases.some((phase) => phase.start_date > effectiveAt)) {
    throw new Error(
      "A later subscription phase needs billing review before this change",
    );
  }
  const index = phases.findIndex(
    (phase) => phase.start_date <= effectiveAt && effectiveAt < phase.end_date,
  );
  const result = phases.map(copySchedulePhase);
  if (index < 0) {
    const last = phases[phases.length - 1];
    if (!last || last.end_date !== effectiveAt) {
      throw new Error(
        "Renewal falls outside the current subscription schedule",
      );
    }
    const next = copySchedulePhase(last);
    delete next.end_date;
    result.push({
      ...next,
      start_date: effectiveAt,
      iterations: 1,
      items,
      metadata: { ...last.metadata, planCode },
    });
    return result;
  }
  const phase = phases[index];
  if (phase.start_date === effectiveAt) {
    result[index].items = items;
    result[index].metadata = { ...phase.metadata, planCode };
  } else {
    result[index].end_date = effectiveAt;
    result.splice(index + 1, 0, {
      ...copySchedulePhase(phase),
      start_date: effectiveAt,
      items,
      metadata: { ...phase.metadata, planCode },
    });
  }
  return result;
}

export async function scheduleModuleChange(
  stripe: Stripe,
  subscriptionId: string,
  effectiveAt: Date,
  items: ScheduledItem[],
  operationId: string,
  planCode: string,
): Promise<string> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const existingSchedule = subscription.schedule
    ? idOf(subscription.schedule)
    : null;
  const schedule = existingSchedule
    ? await stripe.subscriptionSchedules.retrieve(existingSchedule)
    : await stripe.subscriptionSchedules.create(
        { from_subscription: subscriptionId },
        { idempotencyKey: `module-change-schedule:${operationId}` },
      );
  await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      phases: phasesForRenewal(
        schedule,
        Math.floor(effectiveAt.getTime() / 1000),
        items,
        planCode,
      ),
      end_behavior: schedule.end_behavior,
      proration_behavior: "none",
    },
    { idempotencyKey: `module-change-update:${operationId}` },
  );
  return schedule.id;
}

export function phasesForCancellation(
  schedule: Stripe.SubscriptionSchedule,
  effectiveAt: number,
): UpdatePhase[] {
  const phases = schedule.phases.filter(
    (phase) =>
      phase.end_date > Math.floor(Date.now() / 1000) &&
      phase.start_date < effectiveAt,
  );
  const last = phases[phases.length - 1];
  if (!last || last.end_date < effectiveAt) {
    throw new Error(
      "Cancellation falls outside the current subscription schedule",
    );
  }
  const copied = phases.map(copySchedulePhase);
  copied[copied.length - 1].end_date = effectiveAt;
  return copied;
}

export async function scheduleSubscriptionCancellation(
  stripe: Stripe,
  subscriptionId: string,
  effectiveAt: Date,
  operationId: string,
): Promise<string> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const schedule = subscription.schedule
    ? await stripe.subscriptionSchedules.retrieve(idOf(subscription.schedule))
    : await stripe.subscriptionSchedules.create(
        { from_subscription: subscriptionId },
        { idempotencyKey: `module-change-cancel-create:${operationId}` },
      );
  await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      phases: phasesForCancellation(
        schedule,
        Math.floor(effectiveAt.getTime() / 1000),
      ),
      end_behavior: "cancel",
      proration_behavior: "none",
    },
    { idempotencyKey: `module-change-cancel-update:${operationId}` },
  );
  return schedule.id;
}
