import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const schema = readFileSync(
  path.resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migrationDirectory = path.resolve(process.cwd(), "prisma/migrations");
const migrations = readdirSync(migrationDirectory);
const financeMigration = migrations.find((name) =>
  name.includes("finance_ledger_foundation"),
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
      "model FinanceProfile",
      "model FinanceInvoiceNumberSequence",
      "model FinanceInvoice",
      "model FinanceInvoiceLine",
      "model FinanceReceipt",
      "model FinanceReceiptAllocation",
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
    expect(financeMigration).toBeDefined();

    if (!financeMigration) return;
    const migration = readFileSync(
      path.join(migrationDirectory, financeMigration, "migration.sql"),
      "utf8",
    );
    expect(migration.includes("ENABLE ROW LEVEL SECURITY")).toBe(true);
    expect(migration.includes("FORCE ROW LEVEL SECURITY")).toBe(true);
    expect(migration.includes("app.current_tenant_id()")).toBe(true);
    expect(migration.includes("app.current_org_id()")).toBe(true);
    expect(migration.includes("CHECK")).toBe(true);
  });

  it("includes every Finance table in the strict Supabase RLS gate", () => {
    for (const table of [
      "FinanceProfile",
      "FinanceInvoiceNumberSequence",
      "FinanceInvoice",
      "FinanceInvoiceLine",
      "FinanceReceipt",
      "FinanceReceiptAllocation",
    ]) {
      expect(rlsGate.includes(`"${table}"`)).toBe(true);
    }
  });
});
