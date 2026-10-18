import type { FinanceAccessScope } from "../access/finance-access.reader";

export interface FinanceStripeCheckoutActor extends FinanceAccessScope {
  userId: string;
}

export interface FinanceStripeCheckoutView {
  attemptId: string;
  status: "OPEN" | "CHECKING";
  checkoutUrl: string | null;
  expiresAt: string | null;
}

export type FinanceStripeCheckoutAttemptRecord = {
  id: string;
  financeProfileId: string;
  stripeConnectionId: string;
  stripeAccountId: string;
  invoiceId: string;
  invoiceNumber: bigint;
  amountMinor: bigint;
  idempotencyKey: string;
  integrationIdentifier: string;
  stripeCheckoutSessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  status: "CREATING" | "OPEN" | "COMPLETED";
};

export type FinanceStripeCheckoutPreparation =
  | { kind: "create"; attempt: FinanceStripeCheckoutAttemptRecord }
  | { kind: "retrieve"; attempt: FinanceStripeCheckoutAttemptRecord }
  | { kind: "view"; view: FinanceStripeCheckoutView };
