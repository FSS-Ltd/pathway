import {
  financeRecoveryRequestSchema,
  type FinanceRecoveryRequest,
} from "./finance-recovery.contracts";

export type FinanceRecoveryCliArguments =
  | { kind: "help" }
  | { kind: "run"; request: FinanceRecoveryRequest };
const valueFlags = new Set(["--tenant", "--org", "--connection", "--stream"]);

export function parseFinanceRecoveryCliArgs(
  args: readonly string[],
): FinanceRecoveryCliArguments {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  const values = new Map<string, string>();
  let mode: FinanceRecoveryRequest["mode"] = "dry-run";
  let modeSpecified = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply" || flag === "--dry-run") {
      if (modeSpecified) throw invalidArguments();
      modeSpecified = true;
      mode = flag === "--apply" ? "sync" : "dry-run";
      continue;
    }
    if (!valueFlags.has(flag) || values.has(flag)) throw invalidArguments();
    const value = args[++index];
    if (
      !value ||
      value.startsWith("--") ||
      value.trim() !== value ||
      !value.trim()
    )
      throw invalidArguments();
    values.set(flag, value);
  }
  const parsed = financeRecoveryRequestSchema.safeParse({
    tenantId: values.get("--tenant"),
    orgId: values.get("--org"),
    connectionId: values.get("--connection"),
    stream: values.get("--stream"),
    mode,
  });
  if (!parsed.success) throw invalidArguments();
  return { kind: "run", request: parsed.data };
}
function invalidArguments(): Error {
  return new Error("Invalid reconciliation arguments");
}
