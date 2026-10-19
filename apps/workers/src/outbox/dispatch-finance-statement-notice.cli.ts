import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { createDispatchOutboxJob } from "./dispatch-outbox.job";
import {
  HttpOutboxDispatcher,
  loadFinanceStatementNoticeOutboxEndpoint,
} from "./outbox-http-dispatcher";

const STATEMENT_NOTICE_EVENT = "finance.statement.notice.requested";

async function main(): Promise<void> {
  const financeStatements = loadFinanceStatementNoticeOutboxEndpoint(
    process.env,
  );
  if (!financeStatements) {
    throw new Error("Finance statement outbox dispatch is not configured");
  }
  const result = await createDispatchOutboxJob(
    new HttpOutboxDispatcher({
      genericUrl: financeStatements.url,
      financeStatements,
    }),
    [STATEMENT_NOTICE_EVENT],
  ).run();
  console.log("[finance-statement-outbox] dispatch complete", result);
  if (result.deadLettered > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("[finance-statement-outbox] dispatch failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
