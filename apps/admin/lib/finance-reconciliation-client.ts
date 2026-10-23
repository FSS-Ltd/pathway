import { z } from "zod";
import { API_BASE_URL, apiFetch } from "./api-client";
import { financeJsonResponse } from "./finance-api-client-support";

const connection = z.object({
  id: z.string(),
  accountId: z.string().nullable(),
  mode: z.string(),
  status: z.string(),
  disconnectedAt: z.string().nullable(),
  legalEntityName: z.string(),
});
const caseSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  resourceReference: z.string().nullable(),
  amountMinor: z.string().nullable(),
  currency: z.string().nullable(),
  details: z.unknown(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  connection,
});
const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  createdAt: z.string(),
  actorUserId: z.string().nullable(),
  details: z.unknown(),
});
const detailSchema = caseSchema.extend({
  nextEventCursor: z.string().nullable().default(null),
  coverage: z.array(
    z.object({
      stream: z.string(),
      completedThrough: z.string().nullable(),
      lastSucceededAt: z.string().nullable(),
      lastError: z.string().nullable(),
    }),
  ),
  events: z.array(eventSchema),
  evidence: z.array(
    z.object({
      id: z.string(),
      stripeEventId: z.string(),
      eventType: z.string(),
      status: z.string(),
      evidenceSource: z.string(),
      receivedAt: z.string(),
      processedAt: z.string().nullable(),
    }),
  ),
});
export type FinanceCase = z.infer<typeof caseSchema>;
export type FinanceCaseDetail = z.infer<typeof detailSchema>;
export async function fetchFinanceCases(
  status: string,
  currency: string,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: "25" });
  if (status) params.set("status", status);
  if (currency) params.set("currency", currency);
  if (cursor) params.set("cursor", cursor);
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reconciliation/cases?${params}`,
    { cache: "no-store" },
  );
  return z
    .object({ items: z.array(caseSchema), nextCursor: z.string().nullable() })
    .parse(await financeJsonResponse(response, "Cases could not be loaded."));
}
export async function fetchFinanceCase(id: string): Promise<FinanceCaseDetail> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reconciliation/cases/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  return detailSchema.parse(
    await financeJsonResponse(response, "Case could not be loaded."),
  );
}
export async function requestFinanceCaseAction(
  id: string,
  action: "acknowledge" | "recheck" | "replay",
  input: {
    requestId: string;
    reason: string;
    expectedLastSeenAt: string;
    evidenceId?: string;
  },
) {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reconciliation/cases/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return financeJsonResponse(
    response,
    "Case changed or action unavailable. Refresh before retrying.",
  );
}

export async function fetchFinanceCaseHistory(id: string, cursor: string) {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reconciliation/cases/${encodeURIComponent(id)}/history?cursor=${encodeURIComponent(cursor)}`,
    { cache: "no-store" },
  );
  return z
    .object({
      events: z.array(eventSchema),
      nextEventCursor: z.string().nullable(),
    })
    .parse(
      await financeJsonResponse(response, "Case history could not be loaded."),
    );
}
