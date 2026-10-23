import React from "react";
import { Input } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
import {
  allocateFinanceReceipt,
  reverseFinanceReceiptAllocation,
  type FinanceInvoice,
  type FinanceReceipt,
} from "@/lib/finance-workspace-client";
import {
  financeCurrencyFractionDigits,
  formatFinanceMoney,
  parseFinanceMajorAmount,
} from "./finance-format";
import { FinanceConfirmDialog } from "./finance-confirm-dialog";

export function ReceiptAllocationForm({
  receipt,
  invoices,
  canAllocate,
  onComplete,
}: {
  receipt: FinanceReceipt;
  invoices: FinanceInvoice[];
  canAllocate: boolean;
  onComplete: () => Promise<void>;
}) {
  const [invoiceId, setInvoiceId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const matchingInvoices = invoices.filter(
    (invoice) =>
      invoice.status === "ISSUED" &&
      invoice.payerAccountId === receipt.payerAccountId &&
      invoice.currency === receipt.currency &&
      BigInt(invoice.balance.outstandingMinor) > 0n,
  );
  const selectedInvoice = matchingInvoices.find(
    (invoice) => invoice.id === invoiceId,
  );
  const availableMinor = selectedInvoice
    ? minimumAmount(
        BigInt(receipt.unappliedMinor),
        BigInt(selectedInvoice.balance.outstandingMinor),
      )
    : 0n;
  const amountMinor = parseFinanceMajorAmount(amount, receipt.currency);
  const fractionDigits = financeCurrencyFractionDigits(receipt.currency);
  const inputStep =
    fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;

  if (!canAllocate || receipt.status !== "CONFIRMED") return null;
  if (BigInt(receipt.unappliedMinor) <= 0n) return null;
  if (matchingInvoices.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-border-subtle bg-muted/40 p-3 text-sm text-text-muted">
        No open issued invoice matches this payer account and currency. Keep the
        confirmed funds unapplied until a matching invoice is available.
      </p>
    );
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (
      !selectedInvoice ||
      !amountMinor ||
      BigInt(amountMinor) > availableMinor
    ) {
      setError(
        "Choose an open invoice and enter an amount within the available balance.",
      );
      return;
    }
    setIsConfirming(true);
  };

  const confirmAllocation = async () => {
    if (!selectedInvoice || !amountMinor) return;
    setIsSaving(true);
    setError(null);
    try {
      await allocateFinanceReceipt(
        receipt.id,
        { invoiceId: selectedInvoice.id, amountMinor },
        idempotencyKey,
      );
      setIsConfirming(false);
      await onComplete();
      setAmount("");
      setIdempotencyKey(crypto.randomUUID());
      setMessage(
        "Receipt allocation recorded. The invoice balance has been refreshed.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Receipt could not be allocated.",
      );
      setIsConfirming(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-5 border-t border-border-subtle pt-4">
      <h3 className="font-semibold text-text-primary">
        Allocate confirmed funds
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        Only issued invoices for the same payer and currency are available. The
        server checks current balances and pending Checkout reservations again.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="finance-allocation-invoice"
            className="text-sm font-medium text-text-primary"
          >
            Invoice
          </label>
          <select
            id="finance-allocation-invoice"
            required
            value={invoiceId}
            onChange={(event) => {
              setInvoiceId(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
              setMessage(null);
            }}
            disabled={isSaving || isConfirming}
            className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-status-info"
          >
            <option value="">Select an invoice</option>
            {matchingInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                INV-{invoice.invoiceNumber ?? "Draft"} · due{" "}
                {formatFinanceMoney(
                  invoice.balance.outstandingMinor,
                  invoice.currency,
                )}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="finance-allocation-amount"
            className="text-sm font-medium text-text-primary"
          >
            Amount ({receipt.currency})
          </label>
          <Input
            id="finance-allocation-amount"
            type="number"
            min={inputStep}
            step={inputStep}
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
              setMessage(null);
            }}
            disabled={isSaving || isConfirming || !selectedInvoice}
            aria-describedby="finance-allocation-help"
          />
          <p id="finance-allocation-help" className="text-xs text-text-muted">
            Available for this invoice:{" "}
            {formatFinanceMoney(availableMinor.toString(), receipt.currency)}.
          </p>
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={isSaving || isConfirming || !selectedInvoice}
          >
            Review allocation
          </Button>
        </div>
        {error ? (
          <p role="alert" className="sm:col-span-2 text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="sm:col-span-2 text-sm text-text-primary">
            {message}
          </p>
        ) : null}
      </form>

      {isConfirming && selectedInvoice && amountMinor ? (
        <FinanceConfirmDialog
          title="Confirm receipt allocation"
          description={`Allocate ${formatFinanceMoney(amountMinor, receipt.currency)} from receipt ${receipt.id} to invoice INV-${selectedInvoice.invoiceNumber ?? "Draft"}. A correction will be recorded as a separate reversal.`}
          confirmLabel="Confirm allocation"
          busyLabel="Allocating…"
          busy={isSaving}
          onCancel={() => setIsConfirming(false)}
          onConfirm={() => void confirmAllocation()}
        />
      ) : null}
    </div>
  );
}

export function AllocationReversalForm({
  allocation,
  currency,
  canReverse,
  onComplete,
}: {
  allocation: FinanceReceipt["allocations"][number];
  currency: string;
  canReverse: boolean;
  onComplete: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const remainingMinor = BigInt(allocation.netAmountMinor);
  const amountMinor = parseFinanceMajorAmount(amount, currency);
  const fractionDigits = financeCurrencyFractionDigits(currency);
  const inputStep =
    fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;

  if (!canReverse || remainingMinor <= 0n) return null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (
      !amountMinor ||
      BigInt(amountMinor) > remainingMinor ||
      !reason.trim()
    ) {
      setError(
        "Enter a valid correction amount and reason within the remaining allocation.",
      );
      return;
    }
    setIsConfirming(true);
  };

  const confirmReversal = async () => {
    if (!amountMinor || !reason.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await reverseFinanceReceiptAllocation(
        allocation.id,
        { amountMinor, reason: reason.trim() },
        idempotencyKey,
      );
      setIsConfirming(false);
      await onComplete();
      setIsOpen(false);
      setAmount("");
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Allocation correction could not be recorded.",
      );
      setIsConfirming(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-2">
      {!isOpen ? (
        <Button size="sm" variant="secondary" onClick={() => setIsOpen(true)}>
          Correct allocation
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor={`finance-reversal-amount-${allocation.id}`}
              className="text-xs font-medium text-text-primary"
            >
              Correction amount ({currency})
            </label>
            <Input
              id={`finance-reversal-amount-${allocation.id}`}
              type="number"
              min={inputStep}
              step={inputStep}
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setIdempotencyKey(crypto.randomUUID());
              }}
              disabled={isSaving || isConfirming}
              aria-describedby={`finance-reversal-help-${allocation.id}`}
            />
            <p
              id={`finance-reversal-help-${allocation.id}`}
              className="text-xs text-text-muted"
            >
              Remaining:{" "}
              {formatFinanceMoney(remainingMinor.toString(), currency)}.
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`finance-reversal-reason-${allocation.id}`}
              className="text-xs font-medium text-text-primary"
            >
              Reason
            </label>
            <Input
              id={`finance-reversal-reason-${allocation.id}`}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setIdempotencyKey(crypto.randomUUID());
              }}
              disabled={isSaving || isConfirming}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || isConfirming}>
              Review correction
            </Button>
          </div>
          {error ? (
            <p role="alert" className="sm:col-span-2 text-sm text-text-primary">
              {error}
            </p>
          ) : null}
        </form>
      )}

      {isConfirming && amountMinor ? (
        <FinanceConfirmDialog
          title="Confirm allocation correction"
          description={`Reverse ${formatFinanceMoney(amountMinor, currency)} from invoice INV-${allocation.invoiceNumber ?? allocation.invoiceId}. The original allocation and this reason remain in the audit history.`}
          confirmLabel="Confirm correction"
          busyLabel="Saving correction…"
          busy={isSaving}
          onCancel={() => setIsConfirming(false)}
          onConfirm={() => void confirmReversal()}
        />
      ) : null}
    </div>
  );
}

function minimumAmount(left: bigint, right: bigint): bigint {
  return left <= right ? left : right;
}
