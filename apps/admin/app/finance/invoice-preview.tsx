import React from "react";
import type { FinanceInvoiceDetail } from "@/lib/finance-workspace-client";
import { formatFinanceDate, formatFinanceMoney } from "./finance-format";

export function InvoicePreview({ invoice }: { invoice: FinanceInvoiceDetail }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <p className="font-heading text-lg font-semibold text-text-primary">
        Invoice {invoice.invoiceNumber ?? "draft"}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Detail
          label={
            invoice.legalEntityNameSnapshot
              ? "School at issue"
              : "Current school legal entity"
          }
          value={
            invoice.legalEntityNameSnapshot ??
            invoice.legalEntityName ??
            "School legal entity unavailable"
          }
        />
        <Detail
          label="Payer"
          value={invoice.payerName ?? "Payer account unavailable"}
        />
        <Detail label="Due date" value={formatFinanceDate(invoice.dueDate)} />
        <Detail
          label="Status"
          value={invoice.status.replaceAll("_", " ").toLowerCase()}
        />
      </dl>
      <div
        tabIndex={0}
        role="region"
        aria-label="Invoice charge details"
        className="relative overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-status-info"
      >
        <table className="w-full min-w-[580px] text-left text-sm">
          <caption className="sr-only">
            Server-calculated invoice charges
          </caption>
          <thead>
            <tr>
              {[
                "Charge",
                "Quantity",
                "Unit price",
                "Tax rate",
                "Tax",
                "Total",
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border-b border-border-subtle p-2 font-semibold"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="p-2">{line.description}</td>
                <td className="p-2 tabular-nums">{line.quantity}</td>
                <td className="p-2 tabular-nums">
                  {formatFinanceMoney(line.unitAmountMinor, invoice.currency)}
                </td>
                <td className="p-2 tabular-nums">
                  {line.taxRateBasisPoints / 100}%
                </td>
                <td className="p-2 tabular-nums">
                  {formatFinanceMoney(line.taxAmountMinor, invoice.currency)}
                </td>
                <td className="p-2 tabular-nums">
                  {formatFinanceMoney(line.totalMinor, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Detail
          label="Subtotal"
          value={formatFinanceMoney(invoice.subtotalMinor, invoice.currency)}
        />
        <Detail
          label="Tax"
          value={formatFinanceMoney(invoice.taxMinor, invoice.currency)}
        />
        <Detail
          label="Total"
          value={formatFinanceMoney(invoice.totalMinor, invoice.currency)}
        />
      </dl>
      <p className="text-xs leading-5 text-text-muted">
        {invoice.status === "ISSUED" || invoice.status === "VOID"
          ? "Issued charge details are frozen. Later credits and allocations affect the balance separately."
          : "These are the server-calculated charges. School and payer details are frozen when the approved invoice is issued."}
      </p>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-text-primary">
        {value}
      </dd>
    </div>
  );
}
