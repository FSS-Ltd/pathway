export interface FinanceBacsCollectionEndpoint {
  url: string;
  secret: string;
}

export interface FinanceBacsCollectionRunResult {
  scopes: number;
  invoicesGenerated: number;
  debitsSubmitted: number;
  debitsPending: number;
  debitsFailed: number;
}

type DispatchEnvironment = Record<string, string | undefined>;

export function loadFinanceBacsCollectionEndpoint(
  environment: DispatchEnvironment,
): FinanceBacsCollectionEndpoint | undefined {
  const rawUrl = environment.FINANCE_BACS_COLLECTION_JOB_URL?.trim();
  const secret = environment.FINANCE_BACS_COLLECTION_JOB_SECRET?.trim();
  if (!rawUrl && !secret) return undefined;
  if (!rawUrl) {
    throw new Error("FINANCE_BACS_COLLECTION_JOB_URL is required");
  }
  if (!secret) {
    throw new Error("FINANCE_BACS_COLLECTION_JOB_SECRET is required");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("FINANCE_BACS_COLLECTION_JOB_URL must be a valid URL");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/internal/finance/bacs/run-due" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "FINANCE_BACS_COLLECTION_JOB_URL must target the secure Bacs collection endpoint",
    );
  }
  return { url: url.toString(), secret };
}

export async function runFinanceBacsCollection(
  endpoint: FinanceBacsCollectionEndpoint,
  fetcher: typeof fetch = fetch,
): Promise<FinanceBacsCollectionRunResult> {
  const response = await fetcher(endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pathway-internal-secret": endpoint.secret,
    },
    body: "{}",
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      `Finance Bacs collection endpoint returned ${response.status}`,
    );
  }

  const result: unknown = await response.json();
  if (!isFinanceBacsCollectionRunResult(result)) {
    throw new Error(
      "Finance Bacs collection endpoint returned an invalid result",
    );
  }
  return result;
}

function isFinanceBacsCollectionRunResult(
  value: unknown,
): value is FinanceBacsCollectionRunResult {
  if (typeof value !== "object" || value === null) return false;
  return (
    "scopes" in value &&
    isNonNegativeSafeInteger(value.scopes) &&
    "invoicesGenerated" in value &&
    isNonNegativeSafeInteger(value.invoicesGenerated) &&
    "debitsSubmitted" in value &&
    isNonNegativeSafeInteger(value.debitsSubmitted) &&
    "debitsPending" in value &&
    isNonNegativeSafeInteger(value.debitsPending) &&
    "debitsFailed" in value &&
    isNonNegativeSafeInteger(value.debitsFailed)
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}
