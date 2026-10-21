"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  fetchFinanceReceipt,
  type FinanceInvoice,
  type FinanceReceipt,
} from "@/lib/finance-workspace-client";
import { formatFinanceDateTime, formatFinanceMoney } from "./finance-format";
import {
  AllocationReversalForm,
  ReceiptAllocationForm,
} from "./payment-allocation-actions";

export function FinancePaymentWorkspace({
  receipts,
  invoices,
  canAllocate,
  canReverseAllocations,
  isLoading,
  hasMoreInvoices,
  isLoadingMoreInvoices,
  hasMoreReceipts,
  isLoadingMoreReceipts,
  onLoadMoreInvoices,
  onLoadMoreReceipts,
  onRefresh,
}: {
  receipts: FinanceReceipt[];
  invoices: FinanceInvoice[];
  canAllocate: boolean;
  canReverseAllocations: boolean;
  isLoading: boolean;
  hasMoreInvoices: boolean;
  isLoadingMoreInvoices: boolean;
  hasMoreReceipts: boolean;
  isLoadingMoreReceipts: boolean;
  onLoadMoreInvoices: () => Promise<void>;
  onLoadMoreReceipts: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = React.useState<FinanceReceipt | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reviewItems = receipts.filter(
    (receipt) =>
      receipt.status !== "CONFIRMED" || BigInt(receipt.unappliedMinor) > 0n,
  );

  const openReceipt = async (id: string) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      setSelected(await fetchFinanceReceipt(id));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment detail could not be loaded.",
      );
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const safeNextStep = selected
    ? selected.status === "PROCESSING"
      ? "Wait for signed provider confirmation. Do not allocate this payment or record it again."
      : selected.status === "FAILED"
        ? "Check the provider or bank evidence. This failed payment has not reduced the invoice balance."
        : BigInt(selected.unappliedMinor) > 0n
          ? "Match the confirmed funds to an issued invoice. Leave any excess unapplied until it can be safely identified."
          : "This receipt is allocated. Use the allocation history below when reviewing later corrections or reversals."
    : null;

  return (
    <section
      className="space-y-5"
      aria-label="Finance payments and reconciliation"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold text-text-primary">
            Payments and review
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            A payer’s transfer notice is not a receipt. Only confirmed funds can
            be allocated against an invoice.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void onRefresh()}
          disabled={isLoading}
        >
          Refresh payments
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger"
        >
          {error}
        </p>
      ) : null}

      {reviewItems.length > 0 ? (
        <Card
          title="Next item to review"
          description={`${reviewItems.length} of the recent receipts need a decision, confirmation or allocation.`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-text-primary">
                {reviewItems[0]?.status === "PROCESSING"
                  ? "Payment is processing"
                  : reviewItems[0]?.status === "FAILED"
                    ? "Payment failed"
                    : "Confirmed funds are unapplied"}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {reviewItems[0]?.payerName ?? "Family account"} ·{" "}
                {formatFinanceMoney(
                  reviewItems[0]?.amountMinor ?? "0",
                  reviewItems[0]?.currency,
                )}
              </p>
            </div>
            {reviewItems[0] ? (
              <Button
                variant="secondary"
                onClick={() => void openReceipt(reviewItems[0]!.id)}
              >
                Review payment
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card
        title="Receipt register"
        description="Processing, confirmed and failed records are labelled separately."
      >
        {isLoading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading payment records…
          </p>
        ) : receipts.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No payment records yet. A family transfer notice will appear as an
            exception, never as a receipt.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Finance receipt register</caption>
              <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    Payer
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Source
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Detail</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="px-3 py-3 font-medium text-text-primary">
                      {receipt.payerName ?? "Family account"}
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {receipt.source.replaceAll("_", " ").toLowerCase()}
                    </td>
                    <td className="px-3 py-3">
                      <ReceiptStatus
                        status={receipt.status}
                        unapplied={receipt.unappliedMinor}
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatFinanceMoney(
                        receipt.amountMinor,
                        receipt.currency,
                      )}
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {formatFinanceDateTime(
                        receipt.confirmedAt ?? receipt.createdAt,
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void openReceipt(receipt.id)}
                      >
                        View detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {hasMoreReceipts || hasMoreInvoices ? (
        <div className="flex flex-wrap justify-center gap-2">
          {hasMoreReceipts ? (
            <Button
              variant="secondary"
              onClick={() => void onLoadMoreReceipts()}
              disabled={isLoadingMoreReceipts}
            >
              {isLoadingMoreReceipts
                ? "Loading payments…"
                : "Load more payments"}
            </Button>
          ) : null}
          {hasMoreInvoices ? (
            <Button
              variant="secondary"
              onClick={() => void onLoadMoreInvoices()}
              disabled={isLoadingMoreInvoices}
            >
              {isLoadingMoreInvoices
                ? "Loading invoices…"
                : "Load more invoices for allocation"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {isLoadingDetail ? (
        <p role="status" className="text-sm text-text-muted">
          Loading payment evidence…
        </p>
      ) : null}
      {selected ? (
        <Card
          title="Payment evidence and allocation history"
          description={`${selected.payerName ?? "Family account"} · ${selected.source.replaceAll("_", " ").toLowerCase()}`}
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Status" value={selected.status.toLowerCase()} />
            <Detail
              label="Amount"
              value={formatFinanceMoney(
                selected.amountMinor,
                selected.currency,
              )}
            />
            <Detail
              label="Confirmed at"
              value={formatFinanceDateTime(selected.confirmedAt)}
            />
            <Detail
              label="Provider or bank reference"
              value={selected.sourceReference ?? "Not supplied"}
            />
            <Detail
              label="Unapplied funds"
              value={formatFinanceMoney(
                selected.unappliedMinor,
                selected.currency,
              )}
            />
            <Detail
              label="Payment record created"
              value={formatFinanceDateTime(selected.createdAt)}
            />
          </dl>
          <div className="mt-4 rounded-lg border border-border-subtle bg-shell p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Safe next step
            </p>
            <p className="mt-1 text-sm leading-6 text-text-primary">
              {safeNextStep}
            </p>
          </div>
          <div className="mt-5">
            <h3 className="font-semibold text-text-primary">Allocations</h3>
            {selected.allocations.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                No invoice allocation is recorded.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border-subtle">
                {selected.allocations.map((allocation) => (
                  <li
                    key={allocation.id}
                    className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-text-primary">
                        Invoice{" "}
                        {allocation.invoiceNumber ?? allocation.invoiceId}
                      </p>
                      <p className="text-xs text-text-muted">
                        Allocated {formatFinanceDateTime(allocation.createdAt)}{" "}
                        · {allocation.reversals.length} reversal
                        {allocation.reversals.length === 1 ? "" : "s"}
                      </p>
                      {allocation.reversals.map((reversal) => (
                        <p
                          key={reversal.id}
                          className="mt-1 text-xs text-text-muted"
                        >
                          Reversed{" "}
                          {formatFinanceMoney(
                            reversal.amountMinor,
                            selected.currency,
                          )}{" "}
                          · {reversal.reason} ·{" "}
                          {formatFinanceDateTime(reversal.createdAt)}
                        </p>
                      ))}
                    </div>
                    <p className="font-semibold tabular-nums text-text-primary">
                      {formatFinanceMoney(
                        allocation.netAmountMinor,
                        selected.currency,
                      )}
                    </p>
                    <AllocationReversalForm
                      allocation={allocation}
                      currency={selected.currency}
                      canReverse={canReverseAllocations}
                      onComplete={async () => {
                        await onRefresh();
                        setSelected(await fetchFinanceReceipt(selected.id));
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ReceiptAllocationForm
            key={selected.id}
            receipt={selected}
            invoices={invoices}
            canAllocate={canAllocate}
            onComplete={async () => {
              await onRefresh();
              setSelected(await fetchFinanceReceipt(selected.id));
            }}
          />
        </Card>
      ) : null}
    </section>
  );
}

function ReceiptStatus({
  status,
  unapplied,
}: {
  status: FinanceReceipt["status"];
  unapplied: string;
}) {
  const label =
    status === "CONFIRMED" && BigInt(unapplied) > 0n
      ? "Confirmed · unapplied"
      : status.toLowerCase();
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${status === "CONFIRMED" ? "border-status-success/30 bg-status-success/5 text-status-success" : status === "PROCESSING" ? "border-status-warning/30 bg-status-warning/5 text-text-primary" : "border-status-danger/30 bg-status-danger/5 text-status-danger"}`}
    >
      {label}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border-subtle pb-2">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium text-text-primary">
        {value}
      </dd>
    </div>
  );
}
