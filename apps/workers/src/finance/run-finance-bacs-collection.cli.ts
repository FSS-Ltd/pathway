import "dotenv/config";
import { closePrisma } from "@pathway/db";
import {
  loadFinanceBacsCollectionEndpoint,
  runFinanceBacsCollection,
} from "./finance-bacs-collection-runner";

async function main(): Promise<void> {
  const endpoint = loadFinanceBacsCollectionEndpoint(process.env);
  if (!endpoint) {
    throw new Error("Finance Bacs collection job is not configured");
  }
  const result = await runFinanceBacsCollection(endpoint);
  console.log("[finance-bacs-collection] run", result);
  if (result.debitsFailed > 0) {
    console.error(
      "[finance-bacs-collection] failed debits require review",
      result,
    );
    process.exitCode = 2;
  }
}

main()
  .catch((error: unknown) => {
    console.error("[finance-bacs-collection] run failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
