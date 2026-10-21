"use client";

import Link from "next/link";
import { Card } from "@pathway/ui";
import { useAdminAccess } from "@/lib/use-admin-access";
import { canAccessBilling, hasCapability, hasPermission } from "@/lib/access";
import { FinanceWorkspace } from "./finance-workspace";

export default function FinancePage() {
  const { role, capabilities, permissions, isLoading } = useAdminAccess();
  const hasEntitlement = hasCapability(capabilities, "finance.invoices.read");
  const canRead = hasPermission(permissions, "finance.invoices.read");

  if (isLoading) {
    return (
      <main
        aria-busy="true"
        className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6"
      >
        <p role="status" className="sr-only">
          Loading Finance
        </p>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-36 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </main>
    );
  }

  if (!hasEntitlement && canAccessBilling(role) && !canRead) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-accent">Finance</p>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Family invoices and payments
          </h1>
        </header>
        <Card
          title="Finance is not included"
          description="Finance is a paid add-on for family invoices, payment allocation, statements and reports. Ask an organisation administrator to review the available options."
        >
          {canAccessBilling(role) ? (
            <Link
              href="/billing"
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              View Billing
            </Link>
          ) : null}
        </Card>
      </main>
    );
  }

  if (!canRead) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-accent">Finance</p>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Access is restricted
          </h1>
        </header>
        <Card
          title="Ask for Finance access"
          description="Your organisation has Finance, but your role does not include permission to view financial records. An organisation administrator can update your role."
        />
      </main>
    );
  }

  return (
    <FinanceWorkspace
      canCreateInvoices={hasPermission(permissions, "finance.invoices.manage")}
      canManageAllocations={hasPermission(
        permissions,
        "finance.invoices.manage",
      )}
      canReviewInvoices={hasPermission(permissions, "finance.approvals.review")}
      canExport={hasPermission(permissions, "finance.exports.create")}
      canReadStatements={hasPermission(permissions, "finance.statements.read")}
      canReadSettings={hasPermission(permissions, "finance.payments.read")}
      showUpgradeIfLocked={canAccessBilling(role) && !hasEntitlement}
    />
  );
}
