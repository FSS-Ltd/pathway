import type { FinanceStripeAccountScope } from "./finance-stripe-references";
import { z } from "zod";

export type FinanceMandateServicingResource =
  | "setupIntents"
  | "mandates"
  | "paymentMethods";
export type FinanceMandateServicingObject =
  | {
      id: string;
      object: "setup_intent";
      created: number;
      livemode: boolean;
      status:
        | "requires_payment_method"
        | "requires_confirmation"
        | "requires_action"
        | "processing"
        | "canceled"
        | "succeeded";
      customer: string | null;
      payment_method: string | null;
      mandate: string | null;
      metadata: {
        finance_mandate_id?: string;
        finance_payer_account_id?: string;
        finance_consent_version?: string;
      };
    }
  | {
      id: string;
      object: "mandate";
      livemode: boolean;
      status: "pending" | "active" | "inactive";
      payment_method: string;
      acceptedAt: number | null;
    }
  | {
      id: string;
      object: "payment_method";
      created: number;
      livemode: boolean;
      type: string;
      customer: string | null;
    };

export interface FinanceMandatePaymentMethodCancellation extends FinanceStripeAccountScope {
  paymentMethodId: string;
  customerId: string;
  idempotencyKey: string;
}
export interface FinanceMandateSetupExpiry extends FinanceStripeAccountScope {
  sessionId: string;
  customerId: string;
  mandateId: string;
  idempotencyKey: string;
}
export interface FinanceStripeMandateServicingProvider {
  retrieve(
    scope: FinanceStripeAccountScope,
    resource: FinanceMandateServicingResource,
    id: string,
  ): Promise<FinanceMandateServicingObject>;
  detachPaymentMethod(
    input: FinanceMandatePaymentMethodCancellation,
  ): Promise<void>;
  expireMandateSetupSession(input: FinanceMandateSetupExpiry): Promise<void>;
}
export const FINANCE_STRIPE_MANDATE_SERVICING_PROVIDER = Symbol(
  "FINANCE_STRIPE_MANDATE_SERVICING_PROVIDER",
);

export class FinanceStripeMandateServicingError extends Error {
  constructor(
    readonly reason:
      | "INVALID_SCOPE"
      | "INVALID_RESPONSE"
      | "NOT_FOUND"
      | "UNAVAILABLE",
  ) {
    super("Finance mandate servicing is temporarily unavailable");
  }
}

const timestamp = z.number().int().safe().nonnegative();
function reference(prefix: string) {
  const id = z
    .string()
    .regex(new RegExp(`^${prefix}[A-Za-z0-9_]+$`))
    .max(255);
  return z
    .union([id, z.object({ id })])
    .nullish()
    .transform((value) =>
      typeof value === "string" ? value : (value?.id ?? null),
    );
}
const setupSchema = z.object({
  id: z
    .string()
    .regex(/^seti_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("setup_intent"),
  created: timestamp,
  livemode: z.boolean(),
  status: z.enum([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
    "canceled",
    "succeeded",
  ]),
  customer: reference("cus_"),
  payment_method: reference("pm_"),
  mandate: reference("mandate_"),
  metadata: z
    .object({
      finance_mandate_id: z.string().min(1).max(128).optional(),
      finance_payer_account_id: z.string().min(1).max(128).optional(),
      finance_consent_version: z.string().min(1).max(128).optional(),
    })
    .nullish()
    .transform((value) => value ?? {}),
});
const mandateSchema = z.object({
  id: z
    .string()
    .regex(/^mandate_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("mandate"),
  livemode: z.boolean(),
  status: z.enum(["pending", "active", "inactive"]),
  payment_method: reference("pm_"),
  customer_acceptance: z.object({ accepted_at: timestamp.nullish() }).nullish(),
});
const methodSchema = z.object({
  id: z
    .string()
    .regex(/^pm_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("payment_method"),
  created: timestamp,
  livemode: z.boolean(),
  type: z.string().min(1).max(80),
  customer: reference("cus_"),
});
const setupSessionSchema = z.object({
  id: z
    .string()
    .regex(/^cs_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("checkout.session"),
  livemode: z.boolean(),
  mode: z.literal("setup"),
  status: z.enum(["open", "complete", "expired"]),
  customer: reference("cus_"),
  metadata: z.object({ finance_mandate_id: z.string().min(1).max(128) }),
});

export function parseFinanceMandateServicingObject(
  scope: FinanceStripeAccountScope,
  resource: FinanceMandateServicingResource,
  id: string,
  value: unknown,
): FinanceMandateServicingObject {
  let object: FinanceMandateServicingObject;
  if (resource === "setupIntents") {
    const parsed = setupSchema.safeParse(value);
    if (!parsed.success)
      throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
    object = parsed.data;
  } else if (resource === "mandates") {
    const parsed = mandateSchema.safeParse(value);
    if (!parsed.success || !parsed.data.payment_method)
      throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
    const { customer_acceptance, payment_method, ...core } = parsed.data;
    object = {
      ...core,
      payment_method,
      acceptedAt: customer_acceptance?.accepted_at ?? null,
    };
  } else {
    const parsed = methodSchema.safeParse(value);
    if (!parsed.success)
      throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
    object = parsed.data;
  }
  if (object.id !== id || object.livemode !== scope.livemode)
    throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
  return object;
}

export function parseFinanceMandateSetupSession(
  input: FinanceMandateSetupExpiry,
  value: unknown,
): z.infer<typeof setupSessionSchema> {
  const parsed = setupSessionSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.id !== input.sessionId ||
    parsed.data.livemode !== input.livemode ||
    parsed.data.customer !== input.customerId ||
    parsed.data.metadata.finance_mandate_id !== input.mandateId
  )
    throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
  return parsed.data;
}
