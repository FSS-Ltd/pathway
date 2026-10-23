import { z } from "zod";
import type { FinanceUnresolvedOperation } from "./finance-unresolved-operations.persistence";

const streams = {
  checkout: "checkoutSessions",
  debit: "paymentIntents",
  mandate: "setupIntents",
  refund: "refunds",
} as const;
const metadataKeys = {
  checkout: "finance_checkout_attempt_id",
  debit: "finance_debit_attempt_id",
  mandate: "finance_mandate_id",
  refund: "finance_refund_id",
} as const;
const searchSchema = z.object({
  stream: z.enum([
    "checkoutSessions",
    "paymentIntents",
    "setupIntents",
    "refunds",
  ]),
  from: z.string().datetime(),
  to: z.string().datetime(),
  cursor: z.string().min(1).max(255).nullable(),
  exhausted: z.boolean(),
});
export type FinanceUnresolvedSearch = z.infer<typeof searchSchema>;

/** Windows describe possible submission time, never a new provider retry allowance. */
export function planFinanceUnresolvedSearch(
  operation: FinanceUnresolvedOperation,
  attemptedAt: Date,
  stored: unknown,
  now: Date,
): FinanceUnresolvedSearch {
  if (operation.kind === "dispute")
    throw new Error("Disputes require a known identity");
  const stream = streams[operation.kind];
  const margin = 5 * 60_000;
  const from = new Date(
    Math.max(0, attemptedAt.getTime() - margin),
  ).toISOString();
  const end = Math.min(
    attemptedAt.getTime() + 23 * 3_600_000 + margin,
    now.getTime(),
  );
  const parsed = searchSchema.safeParse(stored);
  if (
    parsed.success &&
    parsed.data.stream === stream &&
    parsed.data.from === from &&
    Date.parse(parsed.data.to) <= end &&
    Date.parse(parsed.data.to) > Date.parse(from)
  ) {
    if (!parsed.data.exhausted || Date.parse(parsed.data.to) === end)
      return parsed.data;
  }
  return {
    stream,
    from,
    to: new Date(end).toISOString(),
    cursor: null,
    exhausted: false,
  };
}

/** This only locates a candidate; canonical recovery must validate its complete facts. */
export function matchesFinanceUnresolvedMetadata(
  operation: FinanceUnresolvedOperation,
  object: { [key: string]: unknown },
): boolean {
  if (operation.kind === "dispute") return false;
  const metadata = object.metadata;
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    metadataKeys[operation.kind] in metadata &&
    Reflect.get(metadata, metadataKeys[operation.kind]) === operation.id,
  );
}
