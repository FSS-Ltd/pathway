import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeFinanceRecoveryCli } from "../src/finance/reconciliation/finance-recovery-cli";

async function main(): Promise<void> {
  let runtimeLoaded = false;
  try {
    const result = await executeFinanceRecoveryCli(
      process.argv.slice(2),
      process.env,
      async (request, config) => {
        runtimeLoaded = true;
        const { runFinanceRecoveryRequest } =
          await import("../src/finance/reconciliation/finance-recovery-runtime");
        return runFinanceRecoveryRequest(request, config);
      },
    );
    process.stdout.write(`${result.output}\n`);
    process.exitCode = result.exitCode;
  } finally {
    if (runtimeLoaded) {
      const { closePrisma } = await import("@pathway/db");
      await closePrisma();
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    process.stderr.write(
      "Reconciliation command failed. Check the scoped configuration and restricted worker diagnostics.\n",
    );
    process.exitCode = 1;
  });
}
