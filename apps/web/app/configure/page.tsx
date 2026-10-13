"use client";

import React from "react";
import Link from "next/link";
import {
  isMappedInstitutionalPlanCode,
  type InstitutionalMappedQuote,
} from "@pathway/pricing";
import { isVertical, type Vertical } from "@pathway/types";
import { ConfiguratorStage } from "../../components/configurator/stage";
import { InstitutionalBreakdown } from "../../components/configurator/institutional-breakdown";
import {
  estimateInstitutionalPrice,
  fetchInstitutionalCatalogue,
  startPublicInstitutionalCheckout,
  type InstitutionalCatalogue,
} from "../../lib/institutional-estimate-client";
import { OrgTypeStep } from "./steps/org-type";
import { VerticalStep } from "./steps/vertical";
import { IncludedStep } from "./steps/included";
import { InstitutionalPlanStep } from "./steps/institutional-plan";
import { InstitutionalPupilsStep } from "./steps/institutional-pupils";
import {
  InstitutionalModulesStep,
  InstitutionalStorageStep,
} from "./steps/institutional-options";
import {
  EMPTY_ACCOUNT_DETAILS,
  InstitutionalSummaryStep,
  type InstitutionalAccountDetails,
} from "./steps/institutional-summary";
import {
  enrolledCount,
  INITIAL_CONFIGURATION,
  nextStep,
  previousStep,
  STEP_LABELS,
  stepsFor,
  type InstitutionalConfiguration,
  type InstitutionalStep,
} from "./institutional-flow";
import {
  verticalsForOrgType,
  INITIAL_CONFIGURATOR_STATE,
  type ConfiguratorStep,
} from "./state";

const STORAGE_KEY = "nexsteps-institutional-configuration";
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

function restoredConfiguration(
  value: unknown,
): InstitutionalConfiguration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  if (
    typeof saved.planCode !== "string" ||
    !isMappedInstitutionalPlanCode(saved.planCode) ||
    (saved.orgType !== null &&
      ![
        "SCHOOL",
        "CHURCH",
        "CHARITY",
        "CLUB",
        "NURSERY",
        "LEARNING_CENTRE",
      ].includes(String(saved.orgType))) ||
    typeof saved.countInput !== "string" ||
    !["none", "100", "200", "1000"].includes(String(saved.storageChoice))
  )
    return null;
  const setting =
    isVertical(saved.setting) && saved.setting !== "HOME_EDUCATION"
      ? saved.setting
      : null;
  const configuration: InstitutionalConfiguration = {
    ...INITIAL_CONFIGURATION,
    planCode: saved.planCode,
    orgType: saved.orgType as InstitutionalConfiguration["orgType"],
    setting,
    countInput: saved.countInput,
    declarationAccepted: saved.declarationAccepted === true,
    storageChoice:
      saved.storageChoice as InstitutionalConfiguration["storageChoice"],
  };
  if (
    (setting !== null &&
      (!configuration.orgType ||
        !verticalsForOrgType(configuration.orgType).includes(setting))) ||
    (setting === null &&
      configuration.orgType !== null &&
      verticalsForOrgType(configuration.orgType).length === 1)
  )
    return null;
  configuration.step = stepsFor(configuration.orgType).includes(
    saved.step as InstitutionalStep,
  )
    ? (saved.step as InstitutionalStep)
    : "plan";
  const steps = stepsFor(configuration.orgType);
  const restoredIndex = steps.indexOf(configuration.step);
  if (
    configuration.orgType === null &&
    restoredIndex > steps.indexOf("organisation")
  ) {
    configuration.step = "organisation";
  } else if (
    configuration.orgType !== null &&
    verticalsForOrgType(configuration.orgType).length > 1 &&
    setting === null &&
    restoredIndex > steps.indexOf("setting")
  ) {
    configuration.step = "setting";
  } else if (
    (enrolledCount(configuration.countInput) === null ||
      !configuration.declarationAccepted) &&
    restoredIndex > steps.indexOf("pupils")
  ) {
    configuration.step = "pupils";
  }
  return configuration;
}

export default function ConfigurePage() {
  const [configuration, setConfiguration] = React.useState(
    INITIAL_CONFIGURATION,
  );
  const [details, setDetails] = React.useState<InstitutionalAccountDetails>(
    EMPTY_ACCOUNT_DETAILS,
  );
  const [catalogue, setCatalogue] =
    React.useState<InstitutionalCatalogue | null>(null);
  const [catalogueError, setCatalogueError] = React.useState<string | null>(
    null,
  );
  const [quote, setQuote] = React.useState<InstitutionalMappedQuote | null>(
    null,
  );
  const [priceError, setPriceError] = React.useState<string | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [loadingCatalogue, setLoadingCatalogue] = React.useState(true);
  const [loadingPrice, setLoadingPrice] = React.useState(false);
  const [checkoutPending, setCheckoutPending] = React.useState(false);
  const [configurationRestored, setConfigurationRestored] =
    React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const checkoutKey = React.useRef<string | null>(null);
  const checkoutInFlight = React.useRef(false);

  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved)
        setConfiguration(
          restoredConfiguration(JSON.parse(saved)) ?? INITIAL_CONFIGURATION,
        );
    } catch {
      // Ignore inaccessible or malformed browser storage.
    }
    setConfigurationRestored(true);
  }, []);
  React.useEffect(() => {
    if (!configurationRestored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(configuration));
    } catch {
      // Browser storage is optional; account credentials are never persisted.
    }
  }, [configuration, configurationRestored]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoadingCatalogue(true);
    void fetchInstitutionalCatalogue(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCatalogue(result);
          setCatalogueError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCatalogueError("Plan prices are unavailable. Please retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalogue(false);
      });
    return () => controller.abort();
  }, [retry]);

  const count = enrolledCount(configuration.countInput);
  React.useEffect(() => {
    if (count === null) {
      setQuote(null);
      setPriceError(null);
      return;
    }
    const controller = new AbortController();
    setLoadingPrice(true);
    setPriceError(null);
    setQuote(null);
    void estimateInstitutionalPrice(
      configuration.planCode,
      count,
      configuration.storageChoice,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setQuote(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setPriceError(
            error instanceof Error
              ? error.message
              : "Pricing is unavailable. Please retry.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPrice(false);
      });
    return () => controller.abort();
  }, [configuration.planCode, configuration.storageChoice, count, retry]);

  const update = (patch: Partial<InstitutionalConfiguration>) => {
    checkoutKey.current = null;
    setNavigationError(null);
    setCheckoutError(null);
    setConfiguration((current) => ({ ...current, ...patch }));
  };
  const onNext = () => {
    const step = configuration.step;
    const plan = catalogue?.plans.find(
      (item) => item.planCode === configuration.planCode,
    );
    if (step === "plan" && !plan?.available)
      setNavigationError(
        "This plan price is unavailable. Please retry or choose another plan.",
      );
    else if (step === "organisation" && !configuration.orgType)
      setNavigationError("Choose your organisation type.");
    else if (step === "setting" && !configuration.setting)
      setNavigationError("Choose your setting.");
    else if (
      step === "pupils" &&
      (count === null || !configuration.declarationAccepted)
    )
      setNavigationError(
        "Enter your enrolled pupil count and confirm your declaration.",
      );
    else if (step === "storage" && (loadingPrice || quote?.kind !== "priced"))
      setNavigationError(
        "Wait for an available price before reviewing your purchase.",
      );
    else {
      setNavigationError(null);
      setConfiguration((current) => ({ ...current, step: nextStep(current) }));
    }
  };
  const onCheckout = async () => {
    if (
      checkoutInFlight.current ||
      quote?.kind !== "priced" ||
      count === null ||
      !configuration.setting ||
      !configuration.declarationAccepted
    )
      return;
    checkoutInFlight.current = true;
    setCheckoutPending(true);
    setCheckoutError(null);
    checkoutKey.current ??= crypto.randomUUID();
    try {
      const session = await startPublicInstitutionalCheckout({
        planCode: configuration.planCode,
        enrolledChildren: count,
        declarationAccepted: true,
        setting: configuration.setting,
        storageChoice: configuration.storageChoice,
        includedModules: [],
        paidModules: [],
        idempotencyKey: checkoutKey.current,
        org: {
          orgName: details.orgName,
          contactName: details.contactName,
          contactEmail: details.contactEmail,
          password: details.password,
        },
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

  const stageState = {
    ...INITIAL_CONFIGURATOR_STATE,
    step: STAGE_STEPS[configuration.step],
    orgType: configuration.orgType,
    vertical: configuration.setting as Vertical | null,
    selectedIncludedModules: ["LEARNING" as const],
    frequency: configuration.planCode.endsWith("_YEARLY")
      ? ("yearly" as const)
      : ("monthly" as const),
    storageChoice: configuration.storageChoice,
  };
  const selectedPlan = catalogue?.plans.find(
    (item) => item.planCode === configuration.planCode,
  );
  const steps = stepsFor(configuration.orgType);

  return (
    <main className="bg-shell px-4 py-8 text-text-primary sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="max-w-3xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Configure Nexsteps
          </p>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Build a workspace for every pupil you serve.
          </h1>
          <p className="text-base leading-relaxed text-text-muted">
            Choose your plan, setting, enrolled pupil count and storage. You’ll
            see the amount due before moving to secure payment.
          </p>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-[minmax(0,1fr),minmax(340px,0.78fr)]">
          <div className="min-w-0 space-y-6">
            <nav
              aria-label="Configuration progress"
              className="overflow-x-auto"
            >
              <ol className="flex min-w-max gap-2 pb-2 text-xs sm:flex-wrap sm:text-sm">
                {steps.map((step, index) => (
                  <li
                    key={step}
                    aria-current={
                      configuration.step === step ? "step" : undefined
                    }
                    className={`rounded-full px-3 py-1.5 ${configuration.step === step ? "bg-accent-primary text-accent-foreground" : "bg-surface text-text-muted"}`}
                  >
                    {index + 1}. {STEP_LABELS[step]}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-soft sm:p-7">
              {loadingCatalogue ? (
                <p role="status">Loading plans…</p>
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
                    Retry plans
                  </button>
                </div>
              ) : catalogue ? (
                <>
                  {configuration.step === "plan" && (
                    <InstitutionalPlanStep
                      catalogue={catalogue}
                      selected={configuration.planCode}
                      onSelect={(planCode) => update({ planCode })}
                    />
                  )}
                  {configuration.step === "organisation" && (
                    <OrgTypeStep
                      orgType={configuration.orgType}
                      onSelect={(orgType) =>
                        update({
                          orgType,
                          setting:
                            orgType === "SCHOOL" ||
                            orgType === "LEARNING_CENTRE"
                              ? null
                              : orgType,
                        })
                      }
                    />
                  )}
                  {configuration.step === "setting" && (
                    <VerticalStep
                      orgType={configuration.orgType ?? "SCHOOL"}
                      vertical={configuration.setting as Vertical | null}
                      onSelect={(setting) =>
                        update({
                          setting:
                            setting as InstitutionalConfiguration["setting"],
                        })
                      }
                    />
                  )}
                  {configuration.step === "pupils" && (
                    <InstitutionalPupilsStep
                      countInput={configuration.countInput}
                      declarationAccepted={configuration.declarationAccepted}
                      onCountChange={(countInput) => update({ countInput })}
                      onDeclarationChange={(declarationAccepted) =>
                        update({ declarationAccepted })
                      }
                    />
                  )}
                  {configuration.step === "included" &&
                    configuration.setting && (
                      <IncludedStep
                        vertical={configuration.setting as Vertical}
                      />
                    )}
                  {configuration.step === "modules" && (
                    <InstitutionalModulesStep />
                  )}
                  {configuration.step === "storage" && (
                    <InstitutionalStorageStep
                      choice={configuration.storageChoice}
                      onSelect={(storageChoice) => update({ storageChoice })}
                    />
                  )}
                  {configuration.step === "summary" && (
                    <InstitutionalSummaryStep
                      configuration={configuration}
                      quote={quote}
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
                      disabled={configuration.step === "plan"}
                      onClick={() =>
                        update({ step: previousStep(configuration) })
                      }
                      className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Back
                    </button>
                    {configuration.step !== "summary" && (
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
                selectedPlan?.tier ? `Nexsteps ${selectedPlan.tier}` : undefined
              }
            />
            <InstitutionalBreakdown
              quote={quote}
              loading={loadingPrice}
              error={priceError}
              onRetry={() => setRetry((value) => value + 1)}
            />
            <Link
              href="/demo"
              className="block text-center text-sm font-semibold text-accent-strong underline"
            >
              Need a tailored quote?
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
