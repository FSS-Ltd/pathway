import { z } from "zod";
import { stripeChargeIdSchema } from "../stripe/finance-stripe-references";
import {
  disputeEventTypes,
  refundEventTypes,
} from "../stripe/finance-stripe-reversal-webhook.contracts";
import type {
  FinanceReconciliationObject,
  FinanceReconciliationScope,
  FinanceReconciliationStream,
  StripeFinanceReconciliationProvider,
} from "../stripe/finance-stripe-reconciliation.provider";

const nestedObjectSchema = z
  .object({
    id: z.string().min(1).max(255),
    object: z.string(),
    created: z.number().int().safe().nonnegative(),
  })
  .passthrough();

function reference(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  )
    return value.id;
  return null;
}

export async function prepareFinanceReconciliationObjects(
  scope: FinanceReconciliationScope,
  stream: FinanceReconciliationStream,
  objects: FinanceReconciliationObject[],
  provider: Pick<StripeFinanceReconciliationProvider, "retrieve">,
): Promise<FinanceReconciliationObject[]> {
  const reads = new Map<string, Promise<FinanceReconciliationObject>>();
  function read(resource: FinanceReconciliationStream, id: string) {
    const key = `${resource}:${id}`;
    let pending = reads.get(key);
    if (!pending) {
      pending = provider.retrieve(scope, resource, id);
      reads.set(key, pending);
    }
    return pending;
  }
  async function enrich(
    object: FinanceReconciliationObject,
  ): Promise<FinanceReconciliationObject> {
    if (object.object !== "refund" && object.object !== "dispute")
      return object;
    let enriched = { ...object };
    const chargeId = reference(object.charge);
    if (
      !reference(object.payment_intent) &&
      stripeChargeIdSchema.safeParse(chargeId).success &&
      chargeId
    ) {
      const charge = await read("charges", chargeId);
      const intentId = reference(charge.payment_intent);
      if (intentId && /^pi_[A-Za-z0-9_]{1,252}$/.test(intentId))
        enriched.payment_intent = intentId;
    }
    if (
      object.object === "dispute" &&
      Array.isArray(object.balance_transactions) &&
      object.balance_transactions.length <= 2
    ) {
      const movements: unknown[] = [];
      // Sequential within one object: at most four remote reads run across the page.
      for (const movement of object.balance_transactions) {
        movements.push(
          typeof movement === "string" &&
            /^txn_[A-Za-z0-9_]{1,251}$/.test(movement)
            ? await read("balanceTransactions", movement)
            : movement,
        );
      }
      enriched = { ...enriched, balance_transactions: movements };
    }
    return enriched;
  }
  async function prepare(object: FinanceReconciliationObject) {
    if (stream !== "events") return enrich(object);
    if (
      typeof object.type !== "string" ||
      (!refundEventTypes.has(object.type) &&
        !disputeEventTypes.has(object.type))
    )
      return object;
    const data = object.data;
    if (!data || typeof data !== "object" || !("object" in data)) return object;
    const nested = nestedObjectSchema.safeParse(data.object);
    if (!nested.success) return object;
    return { ...object, data: { ...data, object: await enrich(nested.data) } };
  }
  const result: FinanceReconciliationObject[] = [];
  for (let offset = 0; offset < objects.length; offset += 4)
    result.push(
      ...(await Promise.all(objects.slice(offset, offset + 4).map(prepare))),
    );
  return result;
}
