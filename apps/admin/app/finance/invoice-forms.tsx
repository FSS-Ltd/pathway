import React from "react";
import { Card, Input } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
import {
  createFinanceInvoiceDraft,
  createFinancePayerAccount,
  type FinancePayerAccount,
} from "@/lib/finance-workspace-client";
import {
  financeCurrencyFractionDigits,
  parseFinanceMajorAmount,
} from "./finance-format";

export function InvoiceDraftForm({
  payerAccounts,
  hasMorePayerAccounts,
  isLoadingMorePayerAccounts,
  onLoadMorePayerAccounts,
  currency,
  onCancel,
  onSaved,
}: {
  payerAccounts: FinancePayerAccount[];
  hasMorePayerAccounts: boolean;
  isLoadingMorePayerAccounts: boolean;
  onLoadMorePayerAccounts: () => Promise<void>;
  currency: string | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [payerAccountId, setPayerAccountId] = React.useState(
    payerAccounts[0]?.id ?? "",
  );
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [taxPercent, setTaxPercent] = React.useState("0");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const fractionDigits = currency ? financeCurrencyFractionDigits(currency) : 2;
  const amountStep =
    fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const unitAmountMinor = parseFinanceMajorAmount(amount, currency);
    const taxRateBasisPoints = parseTaxInput(taxPercent);
    if (!payerAccountId || !unitAmountMinor || taxRateBasisPoints === null) {
      setError("Choose a payer and enter a valid amount and tax rate.");
      return;
    }
    setIsSaving(true);
    try {
      await createFinanceInvoiceDraft(
        {
          payerAccountId,
          dueDate: dueDate || null,
          lines: [
            { description, quantity: "1", unitAmountMinor, taxRateBasisPoints },
          ],
        },
        idempotencyKey,
      );
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Draft could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      title="New invoice draft"
      description="The school’s configured currency and the server’s calculation determine the final total."
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="finance-invoice-payer"
            className="text-sm font-medium text-text-primary"
          >
            Payer account
          </label>
          <select
            id="finance-invoice-payer"
            required
            value={payerAccountId}
            onChange={(event) => {
              setPayerAccountId(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
            }}
            className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            disabled={isSaving || payerAccounts.length === 0}
          >
            <option value="">Select a payer account</option>
            {payerAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
          {hasMorePayerAccounts ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void onLoadMorePayerAccounts()}
              disabled={isLoadingMorePayerAccounts || isSaving}
            >
              {isLoadingMorePayerAccounts
                ? "Loading payer accounts…"
                : "Load more payer accounts"}
            </Button>
          ) : null}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="finance-invoice-description"
            className="text-sm font-medium text-text-primary"
          >
            Charge description
          </label>
          <Input
            id="finance-invoice-description"
            required
            maxLength={200}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
            }}
            disabled={isSaving}
            placeholder="e.g. Autumn term tuition"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="finance-invoice-amount"
            className="text-sm font-medium text-text-primary"
          >
            Amount ({currency ?? "school currency"})
          </label>
          <Input
            id="finance-invoice-amount"
            required
            type="number"
            min={amountStep}
            step={amountStep}
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
            }}
            disabled={isSaving}
            aria-describedby="finance-invoice-amount-help"
          />
          <p
            id="finance-invoice-amount-help"
            className="text-xs text-text-muted"
          >
            Enter the line amount in major currency units.
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="finance-invoice-tax"
            className="text-sm font-medium text-text-primary"
          >
            Tax rate (%)
          </label>
          <Input
            id="finance-invoice-tax"
            type="number"
            min="0"
            max="1000"
            step="0.01"
            inputMode="decimal"
            value={taxPercent}
            onChange={(event) => {
              setTaxPercent(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
            }}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="finance-invoice-due"
            className="text-sm font-medium text-text-primary"
          >
            Due date
          </label>
          <Input
            id="finance-invoice-due"
            type="date"
            value={dueDate}
            onChange={(event) => {
              setDueDate(event.target.value);
              setIdempotencyKey(crypto.randomUUID());
            }}
            disabled={isSaving}
          />
        </div>
        {error ? (
          <p role="alert" className="sm:col-span-2 text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSaving || payerAccounts.length === 0}
          >
            {isSaving ? "Saving draft…" : "Save draft"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function PayerAccountForm({
  onSaved,
}: {
  onSaved: (account: FinancePayerAccount) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const account = await createFinancePayerAccount(
        name.trim(),
        idempotencyKey,
      );
      await onSaved(account);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payer account could not be created.",
      );
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
      <label
        htmlFor="finance-payer-account-name"
        className="block text-sm font-medium text-text-primary"
      >
        Family account name
      </label>
      <Input
        id="finance-payer-account-name"
        required
        maxLength={255}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setIdempotencyKey(crypto.randomUUID());
        }}
        disabled={isSaving}
        autoComplete="off"
      />
      {error ? (
        <p role="alert" className="text-sm text-text-primary">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={isSaving || !name.trim()}>
        {isSaving ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}

function parseTaxInput(value: string): number | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const basisPoints = whole * 100 + fraction;
  return Number.isSafeInteger(basisPoints) && basisPoints <= 100_000
    ? basisPoints
    : null;
}
