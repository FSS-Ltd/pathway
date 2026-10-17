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
      "enum FinanceInvoiceStatus",
      "enum FinanceReceiptStatus",
      "enum FinanceManualReceiptRequestStatus",
      "enum FinanceBankTransferChangeStatus",
      "model FinanceProfile",
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
      "model FinancePayerAccount",
      "model FinancePayerGrant",
      "model FinanceCreditNoteNumberSequence",
      "model FinanceCreditNote",
      "model FinanceCreditNoteLine",
      "model FinanceCreditNoteEvent",
      "model FinanceCommandReceipt",
    ]) {
      expect(schema.includes(declaration)).toBe(true);
    }
    expect(schema).toMatch(
      /tenant\s+Tenant\s+@relation\(fields: \[tenantId, orgId\], references: \[id, orgId\]/,
    );
  });

  it("stores financial amounts in integer minor units and requires forced tenant RLS", () => {
    expect(/subtotalMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/taxMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/totalMinor\s+BigInt/.test(schema)).toBe(true);
    expect(/amountMinor\s+BigInt/.test(schema)).toBe(true);
    expect(financeMigrations.length).toBeGreaterThanOrEqual(6);
    for (const migration of [
      "20261024000000_finance_receipt_allocation",
      "20261025000000_finance_receipt_evidence_guard",
      "20261026000000_finance_receipt_confirmation_transition",
      "20261027000000_finance_manual_transfers",
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
      "FinancePayerAccount",
      "FinancePayerGrant",
      "FinanceCreditNote",
      "FinanceCreditNoteLine",
      "FinanceCreditNoteEvent",
      "FinanceCommandReceipt",
    ]) {
      expect(rlsGate.includes(`"${table}"`)).toBe(true);
    }
  });
});
