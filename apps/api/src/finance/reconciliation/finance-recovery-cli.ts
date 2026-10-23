import {
  financeRecoveryStreams,
  type FinanceRecoveryRequest,
} from "./finance-recovery.contracts";
import {
  parseFinanceRecoveryCliArgs,
  type FinanceRecoveryCliArguments,
} from "./finance-recovery-cli-args";
import {
  loadFinanceStripeServicingConfig,
  type FinanceStripeServicingConfig,
} from "../stripe/finance-stripe-servicing.config";

export const financeRecoveryCliHelp = `Usage: pnpm --filter @pathway/api finance:reconcile --tenant <tenant-id> --org <org-id> --connection <connection-id> --stream <stream> [--dry-run | --apply]

Default: --dry-run. Scope and stream are required. --apply captures recovery evidence and advances durable work.
Streams: ${financeRecoveryStreams.join(", ")}
Environment: DATABASE_URL and explicit FINANCE_STRIPE_SERVICING_MODE with the matching FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST or FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE. No environment files are loaded.
Exit codes: 0 completed/help; 1 invalid arguments/configuration or failed run; 2 disabled, continued, busy or lost.
`;

export interface FinanceRecoveryCliResult {
  mode: "sync" | "dry-run";
  status: "completed" | "continued" | "busy" | "failed" | "lost" | "disabled";
  pages: number;
  objects: number;
  recoverable: number;
  exceptions: number;
}
export type FinanceRecoveryCliRuntime = (
  request: FinanceRecoveryRequest,
  config: FinanceStripeServicingConfig,
) => Promise<FinanceRecoveryCliResult>;

/** Inject the runtime so argument/configuration tests never initialise a database or provider. */
export async function executeFinanceRecoveryCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  run: FinanceRecoveryCliRuntime,
): Promise<{ exitCode: number; output: string }> {
  let parsed: FinanceRecoveryCliArguments;
  try {
    parsed = parseFinanceRecoveryCliArgs(args);
  } catch {
    return {
      exitCode: 1,
      output: JSON.stringify({
        status: "invalid_arguments",
        pages: 0,
        objects: 0,
        recoverable: 0,
        exceptions: 0,
      }),
    };
  }
  if (parsed.kind === "help")
    return { exitCode: 0, output: financeRecoveryCliHelp };
  let config: FinanceStripeServicingConfig;
  try {
    config = loadFinanceStripeServicingConfig({ mode: "disabled" }, env);
    if (config.mode !== "disabled" && !env.DATABASE_URL?.trim())
      throw new Error("Explicit database configuration is required");
  } catch {
    return {
      exitCode: 1,
      output: JSON.stringify({
        status: "invalid_configuration",
        mode: parsed.request.mode,
        pages: 0,
        objects: 0,
        recoverable: 0,
        exceptions: 0,
      }),
    };
  }
  let result: FinanceRecoveryCliResult;
  try {
    result =
      config.mode === "disabled"
        ? {
            status: "disabled",
            mode: parsed.request.mode,
            pages: 0,
            objects: 0,
            recoverable: 0,
            exceptions: 0,
          }
        : await run(parsed.request, config);
  } catch {
    return {
      exitCode: 1,
      output: JSON.stringify({
        status: "failed",
        mode: parsed.request.mode,
        pages: 0,
        objects: 0,
        recoverable: 0,
        exceptions: 0,
      }),
    };
  }
  // Select public counters explicitly; never print provider payloads, scope IDs or arbitrary error fields.
  const safe = {
    mode: result.mode,
    status: result.status,
    pages: result.pages,
    objects: result.objects,
    recoverable: result.recoverable,
    exceptions: result.exceptions,
  };
  return {
    exitCode:
      result.status === "completed" ? 0 : result.status === "failed" ? 1 : 2,
    output: JSON.stringify(safe),
  };
}
