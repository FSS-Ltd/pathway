"use client";

import React from "react";
import { Card, Input } from "@pathway/ui";
import { FinanceButton as Button } from "../finance-button";
import { useStatementName } from "./use-statement-name";
import { validateStatementName } from "./statement-name-validation";

export function StatementNameCard({ canManage }: { canManage: boolean }) {
  const { value, loading, error, load } = useStatementName();
  const [draft, setDraft] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [copyMessage, setCopyMessage] = React.useState<string | null>(null);
  const copyGeneration = React.useRef(0);
  const connected = value?.status === "CONNECTED" ? value : null;
  const canPrepare =
    canManage && connected?.canPrepare === true && !loading && !error;
  const validation = validateStatementName(draft);
  const name = draft.trim().normalize("NFC");

  React.useEffect(() => {
    if (connected && !edited) setDraft(connected.descriptor ?? "");
  }, [connected, edited]);
  React.useEffect(() => {
    if (!value) {
      copyGeneration.current += 1;
      setDraft("");
      setEdited(false);
      setCopyMessage(null);
    }
  }, [value]);
  React.useEffect(
    () => () => {
      copyGeneration.current += 1;
    },
    [],
  );

  async function copyDraft() {
    if (!canPrepare || validation) return;
    const generation = ++copyGeneration.current;
    try {
      await navigator.clipboard.writeText(name);
      if (generation === copyGeneration.current)
        setCopyMessage(
          "Draft copied. Save it in Stripe, then check the applied name here.",
        );
    } catch {
      if (generation === copyGeneration.current)
        setCopyMessage(
          "Copy is unavailable. Select the draft name and copy it manually.",
        );
    }
  }

  return (
    <Card
      className="min-w-0 [overflow-wrap:anywhere]"
      title="Name on parents’ bank statements"
      description="Help families recognise card payments to your school."
    >
      <div className="space-y-5" aria-busy={loading}>
        {loading ? (
          <p role="status" className="text-sm text-text-muted">
            Checking the applied name with Stripe…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        {value && !connected ? (
          <p className="text-sm leading-6 text-text-muted">
            {value.status === "NOT_CONFIGURED"
              ? "Save the school’s Finance settings before setting up Stripe."
              : value.status === "DISCONNECTED"
                ? "The school’s Stripe account is disconnected. Its statement name cannot be checked here."
                : "Connect the school’s Stripe account before choosing a statement name."}
          </p>
        ) : null}
        {connected ? (
          <>
            <div className="rounded-lg border border-border-subtle bg-shell p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Applied in Stripe · {connected.livemode ? "Live" : "Sandbox"}
              </p>
              <p className="mt-2 break-words text-lg font-semibold text-text-primary">
                {connected.descriptor ?? "No statement name is set"}
              </p>
              <p className="mt-2 text-xs leading-5 text-text-muted">
                Checked{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/London",
                }).format(new Date(connected.checkedAt))}{" "}
                (London time).
              </p>
            </div>
            {!canManage || !connected.canPrepare ? (
              <p className="text-sm leading-6 text-text-muted">
                You have read-only access here. Preparing a change requires
                active Finance and permission to manage payments.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="finance-statement-name"
                    className="text-sm font-medium text-text-primary"
                  >
                    Choose a card statement name
                  </label>
                  <Input
                    id="finance-statement-name"
                    className="min-w-0 bg-surface"
                    value={draft}
                    disabled={!canPrepare}
                    autoComplete="off"
                    aria-describedby="statement-name-help statement-name-validation"
                    aria-invalid={edited && validation ? true : undefined}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setEdited(true);
                      setCopyMessage(null);
                      copyGeneration.current += 1;
                    }}
                  />
                  <p
                    id="statement-name-help"
                    className="text-xs leading-5 text-text-muted"
                  >
                    Use 5–22 Latin characters and at least one letter. Choose a
                    name families recognise. Stripe checks that it matches your
                    business.
                  </p>
                  <p
                    id="statement-name-validation"
                    aria-live="polite"
                    className="text-sm text-text-primary"
                  >
                    {edited && validation ? validation : ""}
                  </p>
                </div>
                <section
                  aria-label="Example card statement"
                  className="rounded-lg border border-border-subtle p-4"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Example card statement · unapplied draft
                  </h3>
                  <p className="mt-3 min-h-7 break-words font-semibold tracking-wide text-text-primary">
                    {validation ? "Enter a valid name to preview" : name}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-text-muted">
                    Your bank may display this differently. This preview does
                    not change Stripe or existing payments.
                  </p>
                </section>
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-text-muted">
                    An authorised school account owner saves this name in
                    Stripe. Sign in, select{" "}
                    <strong className="text-text-primary">
                      {connected.schoolName}
                    </strong>{" "}
                    (
                    <span className="break-all">
                      {connected.accountReference}
                    </span>
                    ), then edit the statement descriptor in Business settings →
                    Public details.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-auto min-h-10 min-w-0 max-w-full whitespace-normal px-3 py-2"
                      disabled={!canPrepare || !!validation}
                      onClick={() => void copyDraft()}
                    >
                      Copy draft name
                    </Button>
                    <Button
                      asChild
                      className="h-auto min-h-10 min-w-0 max-w-full whitespace-normal px-3 py-2 text-center hover:text-accent-foreground"
                    >
                      <a
                        href="https://dashboard.stripe.com/settings/business-details"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Stripe settings (new tab)
                      </a>
                    </Button>
                  </div>
                  {copyMessage ? (
                    <p role="status" className="text-sm text-text-primary">
                      {copyMessage}
                    </p>
                  ) : null}
                </div>
              </>
            )}
            <p className="border-t border-border-subtle pt-4 text-xs leading-5 text-text-muted">
              Bacs Direct Debit uses separate mandate branding. This card
              setting does not change it or activate paid branding.
            </p>
          </>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-10 min-w-0 max-w-full whitespace-normal px-3 py-2"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Checking…" : "Check applied name"}
        </Button>
      </div>
    </Card>
  );
}
