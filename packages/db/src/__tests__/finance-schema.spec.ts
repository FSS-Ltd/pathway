import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const schema = readFileSync(
  path.resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migrationDirectory = path.resolve(process.cwd(), "prisma/migrations");
const migrations = readdirSync(migrationDirectory);
const financeMigrations = migrations.filter((name) =>
  name.includes("finance_"),
);
const rlsGate = readFileSync(
  path.resolve(process.cwd(), "../../scripts/check-supabase-rls.mjs"),
  "utf8",
);

describe("Finance schema contract", () => {
  it("models tenant-scoped Finance profiles, invoices, receipts and allocations", () => {
    for (const declaration of [
      "enum FinanceCurrency",
      "enum FinanceCountry",
      "enum FinanceStatementKind",
      "enum FinanceStatementStatus",
      "enum FinanceInvoiceStatus",
      "enum FinanceReceiptStatus",
      "enum FinanceManualReceiptRequestStatus",
      "enum FinanceBankTransferChangeStatus",
      "enum FinanceStripeConnectionStatus",
      "enum FinanceCheckoutAttemptStatus",
      "enum FinanceRefundStatus",
      "enum FinanceReceiptMovementType",
      "enum FinanceReceiptMovementSource",
      "enum FinanceRefundEventType",
      "model FinanceProfile",
      "model FinanceStatement",
      "model FinanceInvoiceNumberSequence",
      "model FinanceInvoice",
      "model FinanceInvoiceLine",
      "model FinanceInvoiceEvent",
      "model FinanceReceipt",
      "model FinanceReceiptAllocation",
      "model FinanceReceiptAllocationReversal",
      "model FinanceBankTransferChange",
      "model FinanceManualReceiptRequest",
      "model FinanceTransferNotice",
      "model FinanceStripeConnection",
      "model FinanceCheckoutAttempt",
      "model FinancePayerAccount",
      "model FinancePayerGrant",
      "model FinanceCreditNoteNumberSequence",
      "model FinanceCreditNote",
      "model FinanceCreditNoteLine",
      "model FinanceCreditNoteEvent",
      "model FinanceCommandReceipt",
      "model FinanceRefund",
      "model FinanceRefundEvent",
      "model FinanceReceiptMovement",
      "model FinanceReceiptMovementApplication",
    ]) {
      expect(schema.includes(declaration)).toBe(true);
    }
    expect(schema).toMatch(
      /tenant\s+Tenant\s+@relation\(fields: \[tenantId, orgId\], references: \[id, orgId\]/,
    );
    expect(schema).toMatch(/countryCode\s+FinanceCountry\s+@default\(GB\)/);
  });

  it("stores financial amounts in integer minor units and requires forced tenant RLS", () => {
    expect(/subtotalMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/taxMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/totalMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/amountMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/openingBalanceMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/ledgerCutoffAt\s+DateTime/.test(schema)).toBe(true);
    expect(/processingFundsMinor\s+BigInt/.test(schema)).toBe(true);
    expect(financeMigrations.length).toBeGreaterThanOrEqual(8);
    for (const migration of [
      "20261024000000_finance_receipt_allocation",
      "20261025000000_finance_receipt_evidence_guard",
      "20261026000000_finance_receipt_confirmation_transition",
      "20261027000000_finance_manual_transfers",
      "20261028000000_finance_stripe_connections",
      "20261030000000_finance_stripe_checkout_attempts",
      "20261101000000_finance_statements",
      "20261102000000_finance_supported_currencies",
      "20261103000000_finance_country_currency_profile",
      "20261104000000_finance_refunds_and_returns",
    ]) {
      expect(financeMigrations).toContain(migration);
    }

    for (const financeMigration of financeMigrations) {
      const migration = readFileSync(
        path.join(migrationDirectory, financeMigration, "migration.sql"),
        "utf8",
      );
      if (!migration.includes("CREATE TABLE")) continue;
      expect(migration.includes("ENABLE ROW LEVEL SECURITY")).toBe(true);
      expect(migration.includes("FORCE ROW LEVEL SECURITY")).toBe(true);
      expect(migration.includes("app.current_tenant_id()")).toBe(true);
      expect(migration.includes("app.current_org_id()")).toBe(true);
      expect(migration.includes("CHECK")).toBe(true);
    }
    const payerAccessMigration = readFileSync(
      path.join(
        migrationDirectory,
        "20261019000000_finance_payer_access",
        "migration.sql",
      ),
      "utf8",
    );
    expect(payerAccessMigration).toContain(
      '"FinancePayerGrant_active_account_user_key"',
    );
    const checkoutMigration = readFileSync(
      path.join(
        migrationDirectory,
        "20261030000000_finance_stripe_checkout_attempts",
        "migration.sql",
      ),
      "utf8",
    );
    expect(checkoutMigration).toContain(
      '"FinanceCheckoutAttempt_one_unresolved_per_invoice_key"',
    );
    const statementMigration = readFileSync(
      path.join(
        migrationDirectory,
        "20261101000000_finance_statements",
        "migration.sql",
      ),
      "utf8",
    );
    expect(statementMigration).toContain(
      "CREATE FUNCTION app.list_finance_statement_scopes()",
    );
    expect(statementMigration).toContain("SECURITY DEFINER");
    expect(statementMigration).toContain("SET search_path = ''");
    expect(statementMigration).toContain(
      "REVOKE ALL ON FUNCTION app.list_finance_statement_scopes() FROM PUBLIC",
    );
    expect(statementMigration).toContain(
      "GRANT EXECUTE ON FUNCTION app.list_finance_statement_scopes() TO CURRENT_USER",
    );
    expect(statementMigration).not.toContain('AND "reversalsMinor" >= 0');

    const currencyMigration = readFileSync(
      path.join(
        migrationDirectory,
        "20261102000000_finance_supported_currencies",
        "migration.sql",
      ),
      "utf8",
    );
    for (const currency of ["EUR", "CZK", "DKK", "HUF", "PLN", "RON", "SEK"]) {
      expect(currencyMigration).toContain(`'${currency}'`);
    }
    const countryCurrencyMigration = readFileSync(
      path.join(
        migrationDirectory,
        "20261103000000_finance_country_currency_profile",
        "migration.sql",
      ),
      "utf8",
    );
    expect(countryCurrencyMigration).toContain('ADD COLUMN "countryCode"');
    expect(countryCurrencyMigration).toContain(
      '"FinanceProfile_country_currency_consistent" CHECK',
    );

    const refundMigration = readFileSync(
      path.join(
        migrationDirectory,
        "20261104000000_finance_refunds_and_returns",
        "migration.sql",
      ),
      "utf8",
    );
    expect(refundMigration).toContain('"FinanceRefund_decision_shape" CHECK');
    expect(refundMigration).toContain("SET search_path = ''");
    expect(refundMigration).toContain('FROM %1$I."FinanceReceipt"');
    expect(refundMigration).toContain('FROM %1$I."FinanceStripeWebhookEvent"');
    expect(refundMigration).toContain(
      '"FinanceRefundEvent_manual_return_reference_key"',
    );
    expect(refundMigration).toContain(
      "CONSTRAINT = 'FinanceReceiptMovement_return_exceeds_source'",
    );
    expect(refundMigration).toContain(
      "movement_original_id IS DISTINCT FROM original_application_movement_id",
    );
    expect(refundMigration).toContain("FOR UPDATE;");
    expect(refundMigration).toContain('"FinanceRefundEvent_no_truncate"');
  });

  it("includes every Finance table in the strict Supabase RLS gate", () => {
    for (const table of [
      "FinanceProfile",
      "FinanceInvoiceNumberSequence",
      "FinanceCreditNoteNumberSequence",
      "FinanceInvoice",
      "FinanceInvoiceLine",
      "FinanceInvoiceEvent",
      "FinanceReceipt",
      "FinanceReceiptAllocation",
      "FinanceReceiptAllocationReversal",
      "FinanceBankTransferChange",
      "FinanceManualReceiptRequest",
      "FinanceTransferNotice",
      "FinanceStripeConnection",
      "FinanceCheckoutAttempt",
      "FinanceStatement",
      "FinancePayerAccount",
      "FinancePayerGrant",
      "FinanceCreditNote",
      "FinanceCreditNoteLine",
      "FinanceCreditNoteEvent",
      "FinanceCommandReceipt",
      "FinanceRefund",
      "FinanceRefundEvent",
      "FinanceReceiptMovement",
      "FinanceReceiptMovementApplication",
    ]) {
      expect(rlsGate.includes(`"${table}"`)).toBe(true);
    }
  });
});
