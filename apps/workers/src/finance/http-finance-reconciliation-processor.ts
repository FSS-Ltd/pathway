import type { FinanceRecoveryProcessor } from "./finance-reconciliation-dispatcher";
import type {
  FinanceRecoveryResult,
  FinanceRecoveryWork,
} from "./finance-reconciliation-contracts";

export class HttpFinanceReconciliationProcessor implements FinanceRecoveryProcessor {
  constructor(
    private readonly baseUrl: URL,
    private readonly internalSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const localHttp =
      baseUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(baseUrl.hostname);
    if (
      !internalSecret.trim() ||
      (baseUrl.protocol !== "https:" && !localHttp) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash
    )
      throw new Error(
        "Finance recovery requires an internal secret and HTTPS or local HTTP",
      );
  }
  async run(
    work: FinanceRecoveryWork,
    mode: "sync" | "dry-run",
  ): Promise<FinanceRecoveryResult> {
    const base = new URL(this.baseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const response = await this.fetcher(
      new URL("internal/finance/reconciliation/run", base),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pathway-internal-secret": this.internalSecret,
        },
        body: JSON.stringify({
          tenantId: work.tenantId,
          orgId: work.orgId,
          connectionId: work.connectionId,
          stream: work.stream,
          mode,
        }),
        signal: AbortSignal.timeout(55_000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(`Finance recovery returned HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== "object" ||
      !("mode" in value) ||
      value.mode !== mode ||
      !("status" in value)
    )
      throw new Error("Finance recovery returned an invalid result");
    const statuses = [
      "completed",
      "continued",
      "busy",
      "failed",
      "lost",
      "disabled",
    ] as const;
    const status = statuses.find((candidate) => candidate === value.status);
    if (!status) throw new Error("Finance recovery returned an invalid status");
    if (status === "disabled")
      return {
        mode,
        status,
        pages: 0,
        objects: 0,
        recoverable: 0,
        exceptions: 0,
      };
    const pages = readCount(value, "pages");
    if (pages > 1)
      throw new Error("Finance recovery exceeded its one-page contract");
    return {
      mode,
      status,
      pages,
      objects: readCount(value, "objects"),
      recoverable: readCount(value, "recoverable"),
      exceptions: readCount(value, "exceptions"),
    };
  }
}
function readCount(value: object, key: string): number {
  const count: unknown = Reflect.get(value, key);
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
    throw new Error("Finance recovery returned invalid counts");
  return count;
}
