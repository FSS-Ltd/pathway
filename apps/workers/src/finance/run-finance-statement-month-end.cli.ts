import "dotenv/config";
import { closePrisma } from "@pathway/db";
import {
  loadFinanceStatementMonthEndEndpoint,
  previousLondonMonth,
} from "./finance-statement-month-end";

async function main(): Promise<void> {
  const endpoint = loadFinanceStatementMonthEndEndpoint(process.env);
  if (!endpoint) {
    throw new Error("Finance statement month-end job is not configured");
  }
  const month = previousLondonMonth();
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pathway-internal-secret": endpoint.secret,
    },
    body: JSON.stringify({ month }),
  });
  if (!response.ok) {
    throw new Error(
      `Finance statement month-end endpoint returned ${response.status}`,
    );
  }
  console.log("[finance-statement-month-end] completed", { month });
}

main()
  .catch((error: unknown) => {
    console.error("[finance-statement-month-end] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
