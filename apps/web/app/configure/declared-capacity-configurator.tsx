"use client";

import React from "react";
import Link from "next/link";
import type { DeclaredCapacityInterval } from "@pathway/pricing";
import { ConfiguratorStage } from "../../components/configurator/stage";
import { OrgTypeStep } from "./steps/org-type";
import { VerticalStep } from "./steps/vertical";
import { IncludedStep } from "./steps/included";
import { DeclaredCapacityModulesStep } from "./steps/declared-capacity-modules";
import { DeclaredCapacityCapacityStep } from "./steps/declared-capacity-capacity-step";
import { DeclaredCapacityPeriodStep } from "./steps/declared-capacity-period-step";
import { DeclaredCapacityPricePanel } from "./steps/declared-capacity-price-panel";
import { DeclaredCapacitySummaryStep } from "./steps/declared-capacity-summary";
import {
  estimateDeclaredCapacityPrice,
  fetchDeclaredCapacityCatalogue,
  startPublicDeclaredCapacityCheckout,
  type DeclaredCapacityEstimate,
  type DeclaredCapacityCatalogue,
} from "../../lib/institutional-estimate-client";
import { setDeclaredCapacityAddonChoice } from "./declared-capacity-flow";
import type { DeclaredCapacityAddonSelection } from "./declared-capacity-flow";
import {
  INITIAL_CONFIGURATOR_STATE,
  verticalsForOrgType,
  type ConfiguratorStep,
  type OrgType,
} from "./state";
import type { Vertical } from "@pathway/types";
import type { InstitutionalVertical } from "@pathway/types";
import type { InstitutionalStep } from "./institutional-flow";

type AccountDetails = {
  orgName: string;
  contactName: string;
  contactEmail: string;
  password: string;
};

const EMPTY_DETAILS: AccountDetails = {
  orgName: "",
  contactName: "",
  contactEmail: "",
  password: "",
};

type FlowState = {
  step: InstitutionalStep;
  interval: DeclaredCapacityInterval;
  orgType: OrgType | null;
  setting: InstitutionalVertical | null;
  capacityInput: string;
  declarationAccepted: boolean;
  addonSelection: DeclaredCapacityAddonSelection;
};

const INITIAL_FLOW: FlowState = {
  step: "plan",
  interval: "month",
  orgType: null,
  setting: null,
  capacityInput: "",
  declarationAccepted: false,
  addonSelection: { trialModules: [], payNowModules: [] },
};

const STEP_LABELS: Record<InstitutionalStep, string> = {
  plan: "Billing period",
  organisation: "Organisation",
  setting: "Setting",
  pupils: "Capacity",
  included: "Core features",
  modules: "Add-ons",
  storage: "Storage",
  summary: "Summary",
};

const STAGE_STEPS: Record<InstitutionalStep, ConfiguratorStep> = {
  plan: "plan",
  organisation: "org-type",
  setting: "vertical",
  pupils: "included",
  included: "included",
  modules: "modules",
  storage: "storage",
  summary: "summary",
};

function capacityFromInput(input: string): number | null {
  if (input.trim() === "") return null;
  const count = Number(input);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function stepsFor(orgType: OrgType | null): InstitutionalStep[] {
  return orgType && verticalsForOrgType(orgType).length === 1
    ? [
        "plan",
        "organisation",
        "pupils",
        "included",
        "modules",
        "storage",
        "summary",
      ]
    : [
        "plan",
        "organisation",
        "setting",
        "pupils",
        "included",
        "modules",
        "storage",
        "summary",
      ];
}

function tierFor(capacity: number | null): string {
  if (capacity === null) return "Choose capacity to see your tier";
  if (capacity >= 251) return "Enterprise · custom quote";
  if (capacity >= 150) return "Professional";
  if (capacity >= 75) return "Growth";
  return "Starter";
}

function trialSlotsFor(
  catalogue: DeclaredCapacityCatalogue | null,
  capacity: number | null,
): number {
  if (!catalogue || capacity === null || capacity >= 251) return 0;
  const plan = [...catalogue.plans]
    .sort((left, right) => right.minimumCapacity - left.minimumCapacity)
    .find((candidate) => capacity >= candidate.minimumCapacity);
  return plan?.trialModuleSlots ?? 0;
}

function declaredCountError(input: string): boolean {
  return input !== "" && capacityFromInput(input) === null;
}

export function DeclaredCapacityConfigurator() {
  const [flow, setFlow] = React.useState(INITIAL_FLOW);
  const [details, setDetails] = React.useState(EMPTY_DETAILS);
  const [catalogue, setCatalogue] =
    React.useState<DeclaredCapacityCatalogue | null>(null);
  const [estimate, setEstimate] =
    React.useState<DeclaredCapacityEstimate | null>(null);
  const [catalogueError, setCatalogueError] = React.useState<string | null>(
    null,
  );
  const [priceError, setPriceError] = React.useState<string | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [loadingCatalogue, setLoadingCatalogue] = React.useState(true);
  const [loadingPrice, setLoadingPrice] = React.useState(false);
  const [checkoutPending, setCheckoutPending] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const checkoutKey = React.useRef<string | null>(null);
  const checkoutInFlight = React.useRef(false);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoadingCatalogue(true);
    void fetchDeclaredCapacityCatalogue(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCatalogue(result);
          setCatalogueError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCatalogueError(
            "Pricing is unavailable. Please retry in a moment.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalogue(false);
      });
    return () => controller.abort();
  }, [retry]);

  const capacity = capacityFromInput(flow.capacityInput);
  const trialSlots = trialSlotsFor(catalogue, capacity);

  React.useEffect(() => {
    if (capacity === null) {
      setEstimate(null);
      setPriceError(null);
      return;
    }
    const controller = new AbortController();
    setLoadingPrice(true);
    setPriceError(null);
    setEstimate(null);
    void estimateDeclaredCapacityPrice(
      capacity,
      flow.interval,
      flow.addonSelection,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setEstimate(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPriceError(
            error instanceof Error
              ? error.message
              : "Pricing is unavailable. Please retry.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPrice(false);
      });
    return () => controller.abort();
  }, [capacity, flow.interval, flow.addonSelection, retry]);

  const update = (patch: Partial<FlowState>) => {
    checkoutKey.current = null;
    setNavigationError(null);
    setCheckoutError(null);
    setFlow((current) => ({ ...current, ...patch }));
  };

  const onNext = () => {
    const step = flow.step;
    if (step === "organisation" && !flow.orgType) {
      setNavigationError("Choose your organisation type.");
      return;
    }
    if (step === "setting" && !flow.setting) {
      setNavigationError("Choose your setting.");
      return;
    }
    if (step === "pupils" && (capacity === null || !flow.declarationAccepted)) {
      setNavigationError("Enter your declared child capacity and confirm it.");
      return;
    }
    if (
      step === "modules" &&
      flow.addonSelection.trialModules.length > trialSlots
    ) {
      setNavigationError(
        `This capacity includes ${trialSlots} free add-on ${trialSlots === 1 ? "trial" : "trials"}. Remove a selection to continue.`,
      );
      return;
    }
    if (step === "storage" && (loadingPrice || !estimate)) {
      setNavigationError(
        "Wait for the server to confirm your price before reviewing.",
      );
      return;
    }
    const steps = stepsFor(flow.orgType);
    setNavigationError(null);
    setFlow((current) => ({
      ...current,
      step: steps[Math.min(steps.indexOf(current.step) + 1, steps.length - 1)],
    }));
  };

  const onCheckout = async () => {
    if (
      checkoutInFlight.current ||
      estimate?.kind !== "priced" ||
      capacity === null ||
      !flow.setting ||
      !flow.declarationAccepted
    )
      return;
    checkoutInFlight.current = true;
    setCheckoutPending(true);
    setCheckoutError(null);
    checkoutKey.current ??= crypto.randomUUID();
    try {
      const session = await startPublicDeclaredCapacityCheckout({
        declaredCapacity: capacity,
        interval: flow.interval,
        expectedTotalPence: estimate.subtotalPence,
        declarationAccepted: true,
        setting: flow.setting,
        payNowModules: flow.addonSelection.payNowModules,
        trialModules: flow.addonSelection.trialModules,
        idempotencyKey: checkoutKey.current,
        org: details,
      });
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Checkout could not be started. Please retry.",
      );
    } finally {
      checkoutInFlight.current = false;
      setCheckoutPending(false);
    }
  };

  const currentSteps = stepsFor(flow.orgType);
  const stepIndex = currentSteps.indexOf(flow.step);
  const stageState = {
    ...INITIAL_CONFIGURATOR_STATE,
    step: STAGE_STEPS[flow.step],
    orgType: flow.orgType,
    vertical: flow.setting as Exclude<Vertical, "HOME_EDUCATION"> | null,
    frequency:
      flow.interval === "year" ? ("yearly" as const) : ("monthly" as const),
    selectedIncludedModules: [],
    selectedOptionalModules: [],
    storageChoice: "none" as const,
  };

  return (
    <main className="bg-shell px-4 py-8 text-text-primary sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="max-w-3xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Configure Nexsteps
          </p>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Build a workspace for every child you serve.
          </h1>
          <p className="text-base leading-relaxed text-text-muted">
            Choose your organisation, setting and declared child capacity. We’ll
            show the server-calculated price before secure payment.
          </p>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-[minmax(0,1fr),minmax(340px,0.78fr)]">
          <div className="min-w-0 space-y-6">
            <nav
              aria-label="Configuration progress"
              className="overflow-x-auto"
            >
              <ol className="flex min-w-max gap-2 pb-2 text-xs sm:flex-wrap sm:text-sm">
                {currentSteps.map((step, index) => (
                  <li
                    key={step}
                    aria-current={flow.step === step ? "step" : undefined}
                    className={`rounded-full px-3 py-1.5 ${flow.step === step ? "bg-accent-primary text-accent-foreground" : "bg-surface text-text-muted"}`}
                  >
                    {index + 1}. {STEP_LABELS[step]}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-soft sm:p-7">
              {loadingCatalogue ? (
                <p role="status">Loading pricing…</p>
              ) : catalogueError ? (
                <div className="space-y-3">
                  <p role="alert" className="text-sm text-status-danger">
                    {catalogueError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                    className="text-sm font-semibold text-accent-strong underline"
                  >
                    Retry pricing
                  </button>
                </div>
              ) : catalogue ? (
                <>
                  {flow.step === "plan" && (
                    <DeclaredCapacityPeriodStep
                      interval={flow.interval}
                      onSelect={(interval) => update({ interval })}
                    />
                  )}
                  {flow.step === "organisation" && (
                    <OrgTypeStep
                      orgType={flow.orgType}
                      onSelect={(orgType) =>
                        update({
                          orgType,
                          setting:
                            verticalsForOrgType(orgType).length === 1
                              ? (verticalsForOrgType(
                                  orgType,
                                )[0] as InstitutionalVertical)
                              : null,
                        })
                      }
                    />
                  )}
                  {flow.step === "setting" && flow.orgType && (
                    <VerticalStep
                      orgType={flow.orgType}
                      vertical={flow.setting as Vertical | null}
                      onSelect={(setting) =>
                        update({ setting: setting as InstitutionalVertical })
                      }
                    />
                  )}
                  {flow.step === "pupils" && (
                    <DeclaredCapacityCapacityStep
                      capacityInput={flow.capacityInput}
                      declarationAccepted={flow.declarationAccepted}
                      invalid={declaredCountError(flow.capacityInput)}
                      tierLabel={tierFor(capacityFromInput(flow.capacityInput))}
                      onCapacityChange={(capacityInput) =>
                        update({ capacityInput })
                      }
                      onDeclarationChange={(declarationAccepted) =>
                        update({ declarationAccepted })
                      }
                    />
                  )}
                  {flow.step === "included" && flow.setting && (
                    <IncludedStep vertical={flow.setting as Vertical} />
                  )}
                  {flow.step === "modules" && (
                    <DeclaredCapacityModulesStep
                      catalogue={catalogue}
                      interval={flow.interval}
                      selection={flow.addonSelection}
                      trialSlots={trialSlots}
                      onChoice={(option, choice) =>
                        update({
                          addonSelection: setDeclaredCapacityAddonChoice(
                            flow.addonSelection,
                            option,
                            choice,
                            flow.interval,
                            trialSlots,
                          ),
                        })
                      }
                    />
                  )}
                  {flow.step === "storage" && (
                    <section
                      aria-labelledby="configurator-step-title"
                      className="space-y-5"
                    >
                      <div>
                        <h2
                          id="configurator-step-title"
                          className="font-heading text-2xl font-bold"
                        >
                          Storage
                        </h2>
                        <p className="mt-2 text-text-muted">
                          Storage and usage packs are outside this offer. You
                          can review available options with your billing admin
                          after your workspace is set up.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border-subtle bg-surface p-4 text-sm text-text-muted">
                        No storage or usage pack has been added to this
                        checkout.
                      </div>
                    </section>
                  )}
                  {flow.step === "summary" && (
                    <DeclaredCapacitySummaryStep
                      capacity={capacity}
                      interval={flow.interval}
                      setting={flow.setting}
                      estimate={estimate}
                      priceError={priceError}
                      details={details}
                      onDetailsChange={(value) => {
                        checkoutKey.current = null;
                        setDetails(value);
                      }}
                      onCheckout={onCheckout}
                      pending={checkoutPending}
                      error={checkoutError}
                    />
                  )}
                  {navigationError && (
                    <p role="alert" className="mt-4 text-sm text-status-danger">
                      {navigationError}
                    </p>
                  )}
                  <div className="mt-8 flex flex-wrap justify-between gap-4 border-t border-border-subtle pt-5">
                    <button
                      type="button"
                      disabled={stepIndex === 0}
                      onClick={() =>
                        update({
                          step: currentSteps[Math.max(0, stepIndex - 1)],
                        })
                      }
                      className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Back
                    </button>
                    {flow.step !== "summary" && (
                      <button
                        type="button"
                        onClick={onNext}
                        className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                      >
                        Continue
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
            <ConfiguratorStage
              state={stageState}
              planLabel={
                capacity === null
                  ? undefined
                  : `Nexsteps ${tierFor(capacity).split(" · ")[0]}`
              }
            />
            <DeclaredCapacityPricePanel
              capacity={capacity}
              interval={flow.interval}
              estimate={estimate}
              loading={loadingPrice}
              error={priceError}
              onRetry={() => setRetry((value) => value + 1)}
            />
            <p className="text-center text-sm text-text-muted">
              Declared capacity is a hard limit on distinct active enrolled
              children across your sites.
            </p>
            <Link
              href="/demo?plan=enterprise"
              className="block text-center text-sm font-semibold text-accent-strong underline"
            >
              Need a tailored Enterprise quote?
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
