"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Input } from "@pathway/ui";
import {
  FINANCE_COUNTRY_CURRENCY_OPTIONS,
  FINANCE_CURRENCY_NAMES,
  financeCurrencyForCountry,
} from "@pathway/platform/finance-currencies";
import { useAdminAccess } from "@/lib/use-admin-access";
import { canAccessBilling, hasCapability, hasPermission } from "@/lib/access";
import {
  fetchFinanceProfileSettings,
  saveFinanceProfileSettings,
  type FinanceProfileSettings,
} from "@/lib/finance-profile-client";

export default function FinanceSettingsPage() {
  const {
    role,
    capabilities,
    permissions,
    isLoading: accessLoading,
  } = useAdminAccess();
  const hasFinanceEntitlement = hasCapability(
    capabilities,
    "finance.invoices.read",
  );
  const canReadFinanceSettings =
    hasFinanceEntitlement &&
    hasPermission(permissions, "finance.payments.read");
  const canManageFinance =
    canReadFinanceSettings &&
    hasPermission(permissions, "finance.payments.manage");
  const [settings, setSettings] = React.useState<FinanceProfileSettings | null>(
    null,
  );
  const [configurationLocked, setConfigurationLocked] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchFinanceProfileSettings();
      setSettings(
        result.profile ?? {
          legalEntityName: "",
          countryCode: "GB",
          currency: "GBP",
        },
      );
      setConfigurationLocked(result.configurationLocked);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Finance settings could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (canReadFinanceSettings) void load();
    else setIsLoading(false);
  }, [canReadFinanceSettings, load]);

  const handleCountryChange = (countryCode: string) => {
    const country = FINANCE_COUNTRY_CURRENCY_OPTIONS.find(
      (option) => option.countryCode === countryCode,
    );
    if (!country || !settings) return;
    setSettings({
      ...settings,
      countryCode: country.countryCode,
      currency: financeCurrencyForCountry(country.countryCode),
    });
    setSaved(false);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings || !canManageFinance || isSaving || configurationLocked)
      return;
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      setSettings(await saveFinanceProfileSettings(settings));
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Finance settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (accessLoading || (canReadFinanceSettings && isLoading)) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div
          className="h-64 animate-pulse rounded-xl bg-surface"
          aria-label="Loading Finance settings"
        />
      </main>
    );
  }

  if (!hasFinanceEntitlement) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-accent">Finance</p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            School currency
          </h1>
        </header>
        <Card
          title="Finance settings are locked"
          description="School currency settings are available to authorised Finance staff when the Finance add-on is active."
        >
          {canAccessBilling(role) ? (
            <Link
              href="/billing"
              className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              View Billing
            </Link>
          ) : null}
        </Card>
      </main>
    );
  }

  if (!canReadFinanceSettings) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-accent">Finance</p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            School currency
          </h1>
        </header>
        <Card
          title="Finance settings are restricted"
          description="Ask an organisation administrator to grant you Finance settings access."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <p className="text-sm font-semibold text-accent">Finance</p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          School currency
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Set the school’s legal country. NexSteps uses its local currency on
          family invoices, receipts and statements.
        </p>
      </header>

      <Card
        title="Invoice and collection currency"
        description="Currency is set from the legal country of the school entity."
      >
        {settings ? (
          <form className="space-y-5" onSubmit={handleSave}>
            <div className="space-y-2">
              <label
                htmlFor="finance-legal-entity"
                className="text-sm font-medium text-text-primary"
              >
                Legal entity name
              </label>
              <Input
                id="finance-legal-entity"
                autoComplete="organization"
                value={settings.legalEntityName}
                maxLength={255}
                required
                disabled={!canManageFinance || configurationLocked || isSaving}
                onChange={(event) => {
                  setSettings({
                    ...settings,
                    legalEntityName: event.target.value,
                  });
                  setSaved(false);
                }}
              />
            </div>

            {!canManageFinance ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-text-muted">
                You have read-only access to these settings.
              </p>
            ) : null}

            <div className="space-y-2">
              <label
                htmlFor="finance-country"
                className="text-sm font-medium text-text-primary"
              >
                School’s legal country
              </label>
              <select
                id="finance-country"
                value={settings.countryCode}
                disabled={!canManageFinance || configurationLocked || isSaving}
                onChange={(event) => handleCountryChange(event.target.value)}
                className="h-10 w-full rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {FINANCE_COUNTRY_CURRENCY_OPTIONS.map((country) => (
                  <option key={country.countryCode} value={country.countryCode}>
                    {country.countryName}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-border-subtle bg-shell p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Family invoice currency
              </p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {settings.currency} ·{" "}
                {FINANCE_CURRENCY_NAMES[settings.currency]}
              </p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Stripe confirms card-payment availability and controls payout
                settlement. If the school’s Stripe payout currency differs,
                Stripe may convert the funds.
              </p>
            </div>

            {configurationLocked ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-text-muted">
                Country and currency are locked after Stripe setup or the first
                Finance record, so existing financial documents remain
                consistent.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p role="status" className="text-sm text-status-success">
                Finance settings saved.
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-text-muted">
                Available local currencies include GBP, EUR, CZK, DKK, HUF, PLN,
                RON and SEK.
              </p>
              <Button
                type="submit"
                disabled={
                  !canManageFinance ||
                  configurationLocked ||
                  isSaving ||
                  !settings.legalEntityName.trim()
                }
              >
                {isSaving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </form>
        ) : (
          <div role="status" className="space-y-3 text-sm text-text-muted">
            <p>Finance settings are not available right now.</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
