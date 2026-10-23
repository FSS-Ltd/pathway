export const financeStripeCheckoutEventTypes = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

export type FinanceStripeCheckoutEventType =
  (typeof financeStripeCheckoutEventTypes)[number];

export function isFinanceStripeCheckoutEventType(
  eventType: string,
): eventType is FinanceStripeCheckoutEventType {
  return financeStripeCheckoutEventTypes.some((type) => type === eventType);
}
