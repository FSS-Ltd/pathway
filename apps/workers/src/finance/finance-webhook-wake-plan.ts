import type { FinanceWebhookWakePlan } from "./finance-webhook-subscription";
import { FinanceWebhookSubscriptionError } from "./finance-webhook-subscription-error";

export function isFinanceWebhookRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFinanceWebhookWakePlan(
  rows: unknown[],
): FinanceWebhookWakePlan {
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !isFinanceWebhookRecord(row) ||
    !Array.isArray(row.scopes) ||
    row.scopes.length > 50 ||
    (row.nextWakeAt !== null &&
      (!(row.nextWakeAt instanceof Date) ||
        !Number.isFinite(row.nextWakeAt.getTime())))
  ) {
    throw new FinanceWebhookSubscriptionError("CONFIGURATION");
  }
  const scopes = row.scopes.map((scope: unknown) => {
    if (
      !isFinanceWebhookRecord(scope) ||
      typeof scope.tenantId !== "string" ||
      !scope.tenantId ||
      scope.tenantId.length > 128 ||
      typeof scope.orgId !== "string" ||
      !scope.orgId ||
      scope.orgId.length > 128
    )
      throw new FinanceWebhookSubscriptionError("CONFIGURATION");
    return { tenantId: scope.tenantId, orgId: scope.orgId };
  });
  if (
    new Set(scopes.map((scope) => JSON.stringify(scope))).size !== scopes.length
  )
    throw new FinanceWebhookSubscriptionError("CONFIGURATION");
  return { scopes, nextWakeAt: row.nextWakeAt };
}
