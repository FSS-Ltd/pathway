import "dotenv/config";
import { readFinanceReconciliationConfig } from "./finance-reconciliation-config";

async function main(): Promise<void> {
  const config = readFinanceReconciliationConfig(process.env);
  if (!config.enabled) {
    console.log("[finance-reconciliation] disabled");
    return;
  }
  const [
    { closePrisma },
    { PrismaFinanceReconciliationStore },
    { HttpFinanceReconciliationProcessor },
    { FinanceReconciliationDispatcher },
  ] = await Promise.all([
    import("@pathway/db"),
    import("./finance-reconciliation.store"),
    import("./http-finance-reconciliation-processor"),
    import("./finance-reconciliation-dispatcher"),
  ]);
  try {
    const result = await new FinanceReconciliationDispatcher(
      new PrismaFinanceReconciliationStore(),
      new HttpFinanceReconciliationProcessor(config.baseUrl, config.secret),
    ).run({ livemode: config.livemode, mode: "sync" });
    console.log("[finance-reconciliation] run", result);
    if (result.failed > 0) process.exitCode = 2;
  } finally {
    await closePrisma();
  }
}
main().catch(() => {
  console.error(
    "[finance-reconciliation] dispatch failed; inspect scoped API recovery cases and internal connectivity",
  );
  process.exitCode = 1;
});
