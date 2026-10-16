import { ConflictException } from "@nestjs/common";
import Stripe from "stripe";

export function customerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

export function assertProviderItemsMatch(
  subscription: Stripe.Subscription,
  expected: Array<{ price: string; quantity: number }>,
): void {
  const actual = subscription.items.data;
  if (
    actual.length !== expected.length ||
    expected.some((item) => {
      const providerItem = actual.find(
        (candidate) => candidate.price.id === item.price,
      );
      return !providerItem || providerItem.quantity !== item.quantity;
    })
  ) {
    throw new ConflictException({ code: "PROVIDER_ITEMS_CHANGED" });
  }
}

export function subscriptionItemsForTarget(
  subscription: Stripe.Subscription,
  current: Array<{ price: string; quantity: number }>,
  target: Array<{ price: string; quantity: number }>,
): Stripe.InvoiceRetrieveUpcomingParams.SubscriptionItem[] {
  assertProviderItemsMatch(subscription, current);
  const targetByPrice = new Map(target.map((item) => [item.price, item]));
  const currentByPrice = new Map(
    subscription.items.data.map((item) => [item.price.id, item]),
  );
  const updates: Stripe.InvoiceRetrieveUpcomingParams.SubscriptionItem[] = [];
  for (const [price, item] of currentByPrice) {
    const targetItem = targetByPrice.get(price);
    updates.push(
      targetItem
        ? {
            id: item.id,
            price: targetItem.price,
            quantity: targetItem.quantity,
          }
        : { id: item.id, deleted: true },
    );
    targetByPrice.delete(price);
  }
  for (const item of targetByPrice.values()) {
    updates.push({ price: item.price, quantity: item.quantity });
  }
  return updates;
}
