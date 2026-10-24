export type FinanceWebhookFailure =
  | "CONNECTION"
  | "PERMISSION"
  | "CONFIGURATION";

export class FinanceWebhookSubscriptionError extends Error {
  constructor(readonly reason: FinanceWebhookFailure) {
    super("Finance webhook subscription is unavailable");
  }
}
