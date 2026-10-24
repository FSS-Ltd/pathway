import { z } from "zod";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

const statementNameSchema = z.union([
  z.object({
    status: z.enum(["NOT_CONFIGURED", "NOT_CONNECTED", "DISCONNECTED"]),
  }),
  z.object({
    status: z.literal("CONNECTED"),
    schoolName: z.string(),
    accountReference: z.string().regex(/^acct_[A-Za-z0-9_]+$/),
    descriptor: z.string().nullable(),
    checkedAt: z.string().datetime(),
    canPrepare: z.boolean(),
    livemode: z.boolean(),
  }),
]);
export type FinanceStatementNameView = z.infer<typeof statementNameSchema>;
export async function fetchFinanceStatementName(
  signal?: AbortSignal,
): Promise<FinanceStatementNameView> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/stripe-connection/statement-name`,
    { cache: "no-store", signal },
  );
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      response.status === 403
        ? "Finance settings access is no longer available."
        : "The name could not be checked with Stripe. Try again.",
    );
  const payload: unknown = await response.json();
  const parsed = statementNameSchema.safeParse(payload);
  if (!parsed.success)
    throw new Error("The name could not be checked with Stripe. Try again.");
  return parsed.data;
}
