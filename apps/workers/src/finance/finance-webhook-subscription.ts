import type {
  FinanceStripeWebhookRunResult,
  FinanceStripeWebhookScope,
} from "./finance-stripe-webhook.job";
import type { FinanceWebhookFailure } from "./finance-webhook-subscription-error";

export interface FinanceWebhookWakePlan {
  scopes: FinanceStripeWebhookScope[];
  nextWakeAt: Date | null;
}

export interface FinanceWebhookSubscription {
  start(
    onWake: () => void,
    onDisconnect: (error: unknown) => void,
  ): Promise<void>;
  readPlan(now: Date): Promise<FinanceWebhookWakePlan>;
  close(): Promise<void>;
}

export interface FinanceWebhookListenerOptions {
  createSubscription(): FinanceWebhookSubscription;
  runScopes(
    scopes: readonly FinanceStripeWebhookScope[],
    signal: AbortSignal,
  ): Promise<FinanceStripeWebhookRunResult>;
  onState?(
    state: FinanceWebhookListenerState,
    reason?: FinanceWebhookFailure,
  ): void;
}

export type FinanceWebhookListenerState =
  | "starting"
  | "listening"
  | "reconnecting"
  | "failed"
  | "stopped";
