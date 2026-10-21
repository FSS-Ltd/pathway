import { z } from "zod";
import type { Prisma } from "@pathway/db";

export interface FinanceStripeBacsWebhookInput {
  stripeEventId: string;
  tenantId: string;
  orgId: string;
  stripeAccountId: string | null;
  eventType: string;
  livemode: boolean;
  payloadJson: Prisma.JsonValue;
}

const eventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  account: z.string().startsWith("acct_"),
  data: z.object({ object: z.record(z.unknown()) }),
});

const referenceSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).passthrough(),
]);

const setupIntentSchema = z.object({
  id: z.string().startsWith("seti_"),
  object: z.literal("setup_intent"),
  status: z.enum([
    "succeeded",
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "canceled",
  ]),
  customer: referenceSchema.nullable(),
  payment_method: referenceSchema.nullable(),
  mandate: referenceSchema.nullable().optional(),
  metadata: z.object({
    finance_mandate_id: z.string().min(1),
    finance_payer_account_id: z.string().min(1),
    finance_consent_version: z.string().min(1),
  }),
});

const paymentIntentSchema = z.object({
  id: z.string().startsWith("pi_"),
  object: z.literal("payment_intent"),
  status: z.enum([
    "processing",
    "succeeded",
    "requires_payment_method",
    "requires_action",
    "requires_confirmation",
    "canceled",
  ]),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  customer: referenceSchema,
  payment_method: referenceSchema,
  metadata: z.object({
    finance_debit_attempt_id: z.string().min(1),
    finance_instalment_id: z.string().min(1),
  }),
});

const mandateSchema = z.object({
  id: z.string().startsWith("mandate_"),
  object: z.literal("mandate"),
  status: z.enum(["active", "inactive", "pending"]),
  customer: referenceSchema.nullable().optional(),
  payment_method: referenceSchema.nullable().optional(),
});

const paymentMethodSchema = z.object({
  id: z.string().startsWith("pm_"),
  object: z.literal("payment_method"),
  customer: referenceSchema.nullable().optional(),
});

export type FinanceStripeBacsEvent =
  | {
      kind: "setup_succeeded";
      eventId: string;
      eventCreatedAt: Date;
      accountId: string;
      livemode: boolean;
      setupIntentId: string;
      customerId: string;
      paymentMethodId: string;
      mandateId: string;
      financeMandateId: string;
      payerAccountId: string;
      consentVersion: string;
    }
  | {
      kind: "setup_failed";
      eventId: string;
      eventCreatedAt: Date;
      accountId: string;
      livemode: boolean;
      setupIntentId: string;
      financeMandateId: string;
      payerAccountId: string;
      consentVersion: string;
    }
  | {
      kind: "payment_intent";
      eventId: string;
      eventCreatedAt: Date;
      accountId: string;
      livemode: boolean;
      status: "processing" | "succeeded" | "failed" | "cancelled";
      paymentIntentId: string;
      amountMinor: bigint;
      currency: string;
      customerId: string;
      paymentMethodId: string;
      debitAttemptId: string;
      instalmentId: string;
    }
  | {
      kind: "mandate_updated";
      eventId: string;
      eventCreatedAt: Date;
      accountId: string;
      livemode: boolean;
      mandateId: string;
      status: "active" | "inactive" | "pending";
      customerId: string | null;
      paymentMethodId: string | null;
    }
  | {
      kind: "payment_method_detached";
      eventId: string;
      eventCreatedAt: Date;
      accountId: string;
      livemode: boolean;
      paymentMethodId: string;
      customerId: string | null;
    };

const supportedEventTypes = new Set([
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "payment_intent.processing",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "mandate.updated",
  "payment_method.detached",
]);

export function parseFinanceStripeBacsEvent(
  input: FinanceStripeBacsWebhookInput,
): FinanceStripeBacsEvent {
  if (!supportedEventTypes.has(input.eventType)) {
    throw new Error("Finance Bacs event type is not supported");
  }
  const parsed = eventSchema.safeParse(input.payloadJson);
  if (
    !parsed.success ||
    parsed.data.id !== input.stripeEventId ||
    parsed.data.type !== input.eventType ||
    parsed.data.livemode !== input.livemode
  ) {
    throw new Error("Finance Bacs event payload is invalid");
  }
  if (!input.stripeAccountId || parsed.data.account !== input.stripeAccountId) {
    throw new Error(
      "Finance Bacs event account does not match its inbox scope",
    );
  }

  const base = {
    eventId: parsed.data.id,
    eventCreatedAt: new Date(parsed.data.created * 1_000),
    accountId: parsed.data.account,
    livemode: parsed.data.livemode,
  };
  const object = parsed.data.data.object;

  if (
    input.eventType === "setup_intent.succeeded" ||
    input.eventType === "setup_intent.setup_failed"
  ) {
    const intent = setupIntentSchema.safeParse(object);
    if (!intent.success) {
      throw new Error("Finance Bacs SetupIntent payload is invalid");
    }
    if (input.eventType === "setup_intent.succeeded") {
      const customerId = referenceId(intent.data.customer);
      const paymentMethodId = referenceId(intent.data.payment_method);
      const mandateId = referenceId(intent.data.mandate);
      if (
        intent.data.status !== "succeeded" ||
        !customerId ||
        !paymentMethodId ||
        !mandateId
      ) {
        throw new Error("Successful Finance Bacs setup is incomplete");
      }
      return {
        kind: "setup_succeeded",
        ...base,
        setupIntentId: intent.data.id,
        customerId,
        paymentMethodId,
        mandateId,
        financeMandateId: intent.data.metadata.finance_mandate_id,
        payerAccountId: intent.data.metadata.finance_payer_account_id,
        consentVersion: intent.data.metadata.finance_consent_version,
      };
    }
    if (intent.data.status === "succeeded") {
      throw new Error("Failed Finance Bacs setup has a successful status");
    }
    return {
      kind: "setup_failed",
      ...base,
      setupIntentId: intent.data.id,
      financeMandateId: intent.data.metadata.finance_mandate_id,
      payerAccountId: intent.data.metadata.finance_payer_account_id,
      consentVersion: intent.data.metadata.finance_consent_version,
    };
  }

  if (input.eventType.startsWith("payment_intent.")) {
    const intent = paymentIntentSchema.safeParse(object);
    if (!intent.success) {
      throw new Error("Finance Bacs PaymentIntent payload is invalid");
    }
    const status = paymentIntentEventStatus(input.eventType);
    if (!eventStatusMatchesIntent(status, intent.data.status)) {
      throw new Error("Finance Bacs PaymentIntent status does not match event");
    }
    return {
      kind: "payment_intent",
      ...base,
      status,
      paymentIntentId: intent.data.id,
      amountMinor: BigInt(intent.data.amount),
      currency: intent.data.currency.toUpperCase(),
      customerId: referenceId(intent.data.customer)!,
      paymentMethodId: referenceId(intent.data.payment_method)!,
      debitAttemptId: intent.data.metadata.finance_debit_attempt_id,
      instalmentId: intent.data.metadata.finance_instalment_id,
    };
  }

  if (input.eventType === "mandate.updated") {
    const mandate = mandateSchema.safeParse(object);
    if (!mandate.success) {
      throw new Error("Finance Bacs Mandate payload is invalid");
    }
    return {
      kind: "mandate_updated",
      ...base,
      mandateId: mandate.data.id,
      status: mandate.data.status,
      customerId: referenceId(mandate.data.customer),
      paymentMethodId: referenceId(mandate.data.payment_method),
    };
  }

  const paymentMethod = paymentMethodSchema.safeParse(object);
  if (!paymentMethod.success) {
    throw new Error("Finance Bacs PaymentMethod payload is invalid");
  }
  return {
    kind: "payment_method_detached",
    ...base,
    paymentMethodId: paymentMethod.data.id,
    customerId: referenceId(paymentMethod.data.customer),
  };
}

function referenceId(
  reference: string | { id: string } | null | undefined,
): string | null {
  if (typeof reference === "string") return reference;
  return reference?.id ?? null;
}

function paymentIntentEventStatus(
  eventType: string,
): "processing" | "succeeded" | "failed" | "cancelled" {
  switch (eventType) {
    case "payment_intent.processing":
      return "processing";
    case "payment_intent.succeeded":
      return "succeeded";
    case "payment_intent.payment_failed":
      return "failed";
    case "payment_intent.canceled":
      return "cancelled";
    default:
      throw new Error("Finance Bacs PaymentIntent event is not supported");
  }
}

function eventStatusMatchesIntent(
  eventStatus: "processing" | "succeeded" | "failed" | "cancelled",
  intentStatus: z.infer<typeof paymentIntentSchema>["status"],
): boolean {
  switch (eventStatus) {
    case "processing":
      return intentStatus === "processing";
    case "succeeded":
      return intentStatus === "succeeded";
    case "failed":
      return intentStatus === "requires_payment_method";
    case "cancelled":
      return intentStatus === "canceled";
  }
}
