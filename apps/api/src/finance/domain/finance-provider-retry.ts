const SAFE_PROVIDER_RETRY_WINDOW_MS = 23 * 60 * 60_000;

/** Leave a margin before Stripe may prune a v1 idempotency key after 24 hours. */
export function canRetryFinanceProviderOperation(
  startedAt: Date,
  now = new Date(),
): boolean {
  const elapsed = now.getTime() - startedAt.getTime();
  return elapsed >= 0 && elapsed < SAFE_PROVIDER_RETRY_WINDOW_MS;
}
