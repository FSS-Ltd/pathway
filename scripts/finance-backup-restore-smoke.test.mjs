import assert from "node:assert/strict";
import test from "node:test";
import { resolveFinanceBackupRestoreUrls } from "./finance-backup-restore-smoke.mjs";

const safeInput = {
  sourceUrl:
    "postgresql://postgres:postgres@localhost:5432/pathway_finance_backup_source?schema=app",
  targetUrl:
    "postgresql://postgres:postgres@localhost:5432/pathway_finance_backup_target?schema=app",
  nodeEnv: "test",
  disposableToken: "finance-backup-restore-disposable-databases",
};

test("accepts two explicitly named databases on one local PostgreSQL service", () => {
  const result = resolveFinanceBackupRestoreUrls(safeInput);
  assert.equal(
    new URL(result.sourceUrl).pathname,
    "/pathway_finance_backup_source",
  );
  assert.equal(
    new URL(result.targetUrl).pathname,
    "/pathway_finance_backup_target",
  );
  assert.equal(new URL(result.sourceUrl).searchParams.has("schema"), false);
});

test("refuses production, remote, mismatched, or unexpected databases", () => {
  assert.throws(
    () =>
      resolveFinanceBackupRestoreUrls({ ...safeInput, nodeEnv: "production" }),
    /explicit disposable test guard/,
  );
  assert.throws(
    () =>
      resolveFinanceBackupRestoreUrls({
        ...safeInput,
        sourceUrl: safeInput.sourceUrl.replace("localhost", "database.example"),
      }),
    /only accepts the local/,
  );
  assert.throws(
    () =>
      resolveFinanceBackupRestoreUrls({
        ...safeInput,
        targetUrl: safeInput.targetUrl.replace(
          "pathway_finance_backup_target",
          "pathway_production",
        ),
      }),
    /only accepts the local/,
  );
  assert.throws(
    () =>
      resolveFinanceBackupRestoreUrls({
        ...safeInput,
        targetUrl: safeInput.targetUrl.replace(
          "postgres:postgres@",
          "postgres:other@",
        ),
      }),
    /one local PostgreSQL service/,
  );
});
