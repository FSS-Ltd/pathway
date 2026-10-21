"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  transitionFinanceInvoice,
  type FinanceInvoice,
  type FinancePayerAccount,
} from "@/lib/finance-workspace-client";
import { formatFinanceDate, formatFinanceMoney } from "./finance-format";
import { InvoiceDraftForm, PayerAccountForm } from "./invoice-forms";
import { FinanceConfirmDialog } from "./finance-confirm-dialog";

type FinanceInvoiceWorkspaceProps = {
  invoices: FinanceInvoice[];
  payerAccounts: FinancePayerAccount[];
  hasMorePayerAccounts: boolean;
  isLoadingMorePayerAccounts: boolean;
  onLoadMorePayerAccounts: () => Promise<void>;
  currency: string | null;
  canCreate: boolean;
  canReview: boolean;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onRefresh: () => Promise<void>;
};

export function FinanceInvoiceWorkspace({
  invoices,
  payerAccounts,
  hasMorePayerAccounts,
  isLoadingMorePayerAccounts,
  onLoadMorePayerAccounts,
  currency,
  canCreate,
  canReview,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRefresh,
}: FinanceInvoiceWorkspaceProps) {
  const [showDraft, setShowDraft] = React.useState(false);
  const [showAccountForm, setShowAccountForm] = React.useState(false);
  const [createdPayerAccounts, setCreatedPayerAccounts] = React.useState<
    FinancePayerAccount[]
  >([]);
  const [confirmIssueId, setConfirmIssueId] = React.useState<string | null>(
    null,
  );
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [actionKeys, setActionKeys] = React.useState<Record<string, string>>(
    {},
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const selectablePayerAccounts = [
    ...createdPayerAccounts,
    ...payerAccounts.filter(
      (account) =>
        !createdPayerAccounts.some((created) => created.id === account.id),
    ),
  ];

  const runInvoiceAction = async (
    invoice: FinanceInvoice,
    action: "submit-review" | "approve" | "issue",
  ) => {
    const actionKey = `${invoice.id}:${action}`;
    const idempotencyKey = actionKeys[actionKey] ?? crypto.randomUUID();
    setActionKeys((current) => ({ ...current, [actionKey]: idempotencyKey }));
    setPendingId(invoice.id);
    setError(null);
    setMessage(null);
    try {
      await transitionFinanceInvoice(invoice.id, action, idempotencyKey);
      setConfirmIssueId(null);
      await onRefresh();
      setActionKeys((current) => {
        const next = { ...current };
        delete next[actionKey];
        return next;
      });
      setMessage(
        action === "submit-review"
          ? "Invoice sent for independent review."
          : action === "approve"
            ? "Invoice approved. A staff member can now issue it."
            : "Invoice issued successfully.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invoice action failed.",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="space-y-5" aria-label="Finance invoices">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold text-text-primary">
            Invoices
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Draft, review and issue are separate steps. Issued totals are
            calculated and frozen by the server.
          </p>
        </div>
        {canCreate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowAccountForm((visible) => !visible)}
            >
              {showAccountForm ? "Close payer form" : "Add payer account"}
            </Button>
            <Button onClick={() => setShowDraft((visible) => !visible)}>
              {showDraft ? "Close draft" : "Create invoice draft"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-status-success/20 bg-status-success/5 p-3 text-sm text-text-primary"
        >
          {message}
        </p>
      ) : null}

      {showDraft ? (
        <InvoiceDraftForm
          payerAccounts={selectablePayerAccounts}
          hasMorePayerAccounts={hasMorePayerAccounts}
          isLoadingMorePayerAccounts={isLoadingMorePayerAccounts}
          onLoadMorePayerAccounts={onLoadMorePayerAccounts}
          currency={currency}
          onCancel={() => setShowDraft(false)}
          onSaved={async () => {
            setShowDraft(false);
            setMessage(
              "Draft saved. Review its calculated total before sending it for approval.",
            );
            await onRefresh();
          }}
        />
      ) : null}

      {showAccountForm ? (
        <Card
          title="Set up a payer account"
          description="Invoices belong to a family payer account. Creating an account does not give a family member access; add an explicit payer grant before they can view or pay invoices."
        >
          <PayerAccountForm
            onSaved={async (account) => {
              setCreatedPayerAccounts((current) => [
                account,
                ...current.filter((item) => item.id !== account.id),
              ]);
              setShowAccountForm(false);
              setMessage(
                "Payer account created. Its family access still needs an explicit grant.",
              );
              await onRefresh();
            }}
          />
        </Card>
      ) : null}

      <Card
        title="Invoice register"
        description="Balances reflect issued credits and confirmed net allocations at the latest ledger projection."
      >
        {isLoading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading invoices…
          </p>
        ) : invoices.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No invoices yet. Create a draft to begin the review flow.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-sm">
              <caption className="sr-only">Finance invoice register</caption>
              <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    Invoice
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Payer
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Outstanding
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Due
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-3 font-semibold text-text-primary">
                      {invoice.invoiceNumber
                        ? `INV-${invoice.invoiceNumber}`
                        : "Draft"}
                    </td>
                    <td className="px-3 py-3 text-text-primary">
                      {invoice.payerName ?? "Payer account"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusLabel
                        status={invoice.status}
                        approved={Boolean(invoice.approvedAt)}
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatFinanceMoney(invoice.totalMinor, invoice.currency)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatFinanceMoney(
                        invoice.balance.outstandingMinor,
                        invoice.currency,
                      )}
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {formatFinanceDate(invoice.dueDate)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {invoice.status === "DRAFT" && canCreate ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            pendingId === invoice.id ||
                            !invoice.totalMinor ||
                            BigInt(invoice.totalMinor) <= 0n
                          }
                          onClick={() =>
                            void runInvoiceAction(invoice, "submit-review")
                          }
                        >
                          Send for review
                        </Button>
                      ) : null}
                      {invoice.status === "IN_REVIEW" &&
                      !invoice.approvedAt &&
                      canReview ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pendingId === invoice.id}
                          onClick={() =>
                            void runInvoiceAction(invoice, "approve")
                          }
                        >
                          Approve
                        </Button>
                      ) : null}
                      {invoice.status === "IN_REVIEW" &&
                      invoice.approvedAt &&
                      canCreate ? (
                        <Button
                          size="sm"
                          disabled={pendingId === invoice.id}
                          onClick={() => setConfirmIssueId(invoice.id)}
                        >
                          Issue invoice
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => void onLoadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading invoices…" : "Load more invoices"}
            </Button>
          </div>
        ) : null}
      </Card>

      {confirmIssueId ? (
        <FinanceConfirmDialog
          title="Issue this invoice?"
          description={issueDescription(
            invoices.find((invoice) => invoice.id === confirmIssueId),
          )}
          confirmLabel="Confirm issue"
          busyLabel="Issuing…"
          busy={pendingId === confirmIssueId}
          onCancel={() => setConfirmIssueId(null)}
          onConfirm={() => {
            const invoice = invoices.find((item) => item.id === confirmIssueId);
            if (invoice) void runInvoiceAction(invoice, "issue");
          }}
        />
      ) : null}
    </section>
  );
}

function issueDescription(invoice: FinanceInvoice | undefined): string {
  if (!invoice) {
    return "This freezes the approved invoice snapshot and makes it available to the authorised family payer.";
  }
  return `This freezes the approved snapshot for ${invoice.payerName ?? "the payer account"}: ${formatFinanceMoney(invoice.totalMinor, invoice.currency)}, due ${formatFinanceDate(invoice.dueDate)}. The authorised family payer can then view it.`;
}

function StatusLabel({
  status,
  approved,
}: {
  status: FinanceInvoice["status"];
  approved: boolean;
}) {
  const label =
    status === "IN_REVIEW" && approved
      ? "Approved · ready to issue"
      : status.replaceAll("_", " ").toLowerCase();
  return (
    <span className="inline-flex rounded-full border border-border-subtle bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-text-primary">
      {label}
    </span>
  );
}
