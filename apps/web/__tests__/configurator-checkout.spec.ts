import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERTICAL_OPTIONS, type Vertical } from "@pathway/types";
import {
  buildCheckoutPayload,
  isValidWorkEmail,
  verticalToSector,
  type ConfiguratorOrganisation,
} from "../lib/configurator-checkout";
import { configuratorRolloutHref } from "../lib/configurator-rollout";
import type { ConfiguratorState } from "../app/configure/state";

const organisation: ConfiguratorOrganisation = {
  organisationName: "Grace Community",
  contactName: "Avery Jordan",
  workEmail: "avery@example.com",
  password: "secure-passphrase",
  successUrl: "https://example.com/buy/thanks",
  cancelUrl: "https://example.com/buy/cancelled",
};

const completeState = (
  overrides: Partial<ConfiguratorState> = {},
): ConfiguratorState => ({
  step: "summary",
  orgType: "SCHOOL",
  vertical: "INDEPENDENT_SCHOOL",
  selectedOptionalModules: [],
  selectedIncludedModules: [],
  planCode: "STARTER_49_MONTHLY",
  frequency: "monthly",
  storageChoice: "none",
  ...overrides,
});

describe("configurator checkout payload", () => {
  it.each([
    ["avery@example.com", true],
    ["avery.jordan+pathway@example.co.uk", true],
    ["avery", false],
    ["avery@", false],
    ["@example.com", false],
    ["avery@example", false],
    ["avery @example.com", false],
  ])("validates work email %p as %p", (email, isValid) => {
    expect(isValidWorkEmail(email)).toBe(isValid);
  });

  it.each([
    [
      "maps Starter monthly with Learning and 100GB",
      completeState({
        selectedOptionalModules: ["LEARNING"],
        selectedIncludedModules: [],
        storageChoice: "100",
      }),
      {
        planCode: "STARTER_49_MONTHLY",
        billingPeriod: "monthly",
        storageAddon100Gb: 1,
        storageAddon200Gb: 0,
        storageAddon1Tb: 0,
        selectedModules: ["LEARNING"],
        selectedIncludedModules: [],
        orgName: "Grace Community",
        contactName: "Avery Jordan",
        contactEmail: "avery@example.com",
        password: "secure-passphrase",
        sector: "SCHOOL",
        successUrl: "https://example.com/buy/thanks",
        cancelUrl: "https://example.com/buy/cancelled",
      },
    ],
    [
      "maps Professional yearly without modules or storage",
      completeState({
        vertical: "CHURCH",
        planCode: "PROFESSIONAL_149_YEARLY",
        frequency: "yearly",
        selectedIncludedModules: [],
      }),
      {
        planCode: "PROFESSIONAL_149_YEARLY",
        billingPeriod: "yearly",
        storageAddon100Gb: 0,
        storageAddon200Gb: 0,
        storageAddon1Tb: 0,
        selectedModules: [],
        selectedIncludedModules: [],
        orgName: "Grace Community",
        contactName: "Avery Jordan",
        contactEmail: "avery@example.com",
        password: "secure-passphrase",
        sector: "CHURCH",
        successUrl: "https://example.com/buy/thanks",
        cancelUrl: "https://example.com/buy/cancelled",
      },
    ],
    [
      "preserves legacy Growth inclusions when no new selection exists",
      completeState({
        planCode: "GROWTH_99_MONTHLY",
        selectedIncludedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
      }),
      {
        planCode: "GROWTH_99_MONTHLY",
        billingPeriod: "monthly",
        storageAddon100Gb: 0,
        storageAddon200Gb: 0,
        storageAddon1Tb: 0,
        selectedModules: [],
        selectedIncludedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
        orgName: "Grace Community",
        contactName: "Avery Jordan",
        contactEmail: "avery@example.com",
        password: "secure-passphrase",
        sector: "SCHOOL",
        successUrl: "https://example.com/buy/thanks",
        cancelUrl: "https://example.com/buy/cancelled",
      },
    ],
    [
      "maps Growth monthly with selected included and paid modules and 1TB storage",
      completeState({
        vertical: "CHARITY",
        planCode: "GROWTH_99_MONTHLY",
        storageChoice: "1000",
        selectedIncludedModules: ["FINANCE", "EVENTS", "HR"],
        selectedOptionalModules: ["LEARNING"],
      }),
      {
        planCode: "GROWTH_99_MONTHLY",
        billingPeriod: "monthly",
        storageAddon100Gb: 0,
        storageAddon200Gb: 0,
        storageAddon1Tb: 1,
        selectedModules: ["LEARNING"],
        selectedIncludedModules: ["FINANCE", "EVENTS", "HR"],
        orgName: "Grace Community",
        contactName: "Avery Jordan",
        contactEmail: "avery@example.com",
        password: "secure-passphrase",
        sector: "CHARITY",
        successUrl: "https://example.com/buy/thanks",
        cancelUrl: "https://example.com/buy/cancelled",
      },
    ],
  ] as const)("%s", (_name, state, expectedPayload) => {
    expect(buildCheckoutPayload(state, organisation)).toEqual(expectedPayload);
  });

  it("maps all seven institutional verticals into the legacy sector union", () => {
    const expectedSectors = new Set(["CHURCH", "CLUB", "SCHOOL", "CHARITY"]);

    for (const { value } of VERTICAL_OPTIONS) {
      if (value === "HOME_EDUCATION") continue;
      expect(expectedSectors).toContain(verticalToSector(value));
    }

    expect(verticalToSector("CHURCH")).toBe("CHURCH");
    expect(verticalToSector("CLUB")).toBe("CLUB");
    expect(verticalToSector("CHARITY")).toBe("CHARITY");
    for (const vertical of [
      "INDEPENDENT_SCHOOL",
      "ACE_SCHOOL",
      "STATE_SCHOOL",
      "NURSERY",
    ] as Vertical[]) {
      expect(verticalToSector(vertical)).toBe("SCHOOL");
    }
  });

  it("refuses to map Home Education into the institutional checkout flow", () => {
    expect(() => verticalToSector("HOME_EDUCATION")).toThrow(
      "Home Education does not use the institutional checkout flow.",
    );
  });

  it.each([
    completeState({ vertical: null }),
    completeState({ planCode: null }),
  ])("rejects incomplete state deterministically", (state) => {
    expect(() => buildCheckoutPayload(state, organisation)).toThrow(
      "A vertical and plan are required before checkout.",
    );
  });
});

describe("configurator rollout", () => {
  it("routes acquisition funnel paths to the configurator unconditionally", () => {
    expect(configuratorRolloutHref("/pricing")).toBe("/configure");
    expect(configuratorRolloutHref("/buy")).toBe("/configure");
    expect(configuratorRolloutHref("/buy/thanks")).toBe("/buy/thanks");
    expect(configuratorRolloutHref("/demo")).toBe("/demo");
  });
});

describe("configurator checkout and rollout source contracts", () => {
  const appRoot = process.cwd();
  const readSource = (path: string) =>
    readFileSync(join(appRoot, path), "utf8");

  it("uses the rollout helper from every named acquisition CTA source", () => {
    const sourceContracts: Record<string, string[]> = {
      "components/header-nav.tsx": [
        'href: configuratorRolloutHref("/pricing")',
      ],
      "components/footer.tsx": ['href: configuratorRolloutHref("/pricing")'],
      "components/home-cta-section.tsx": [
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "components/sector/SectorLandingPage.tsx": [
        "href={configuratorRolloutHref(sector.secondaryCtaHref)}",
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "app/(marketing)/features/attendance/page.tsx": [
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "app/(marketing)/features/family-communication/page.tsx": [
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "app/(marketing)/features/reporting/page.tsx": [
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "app/(marketing)/features/safeguarding/page.tsx": [
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "app/(marketing)/features/teams-scheduling/page.tsx": [
        'href={configuratorRolloutHref("/pricing")}',
      ],
      "app/(marketing)/readiness-score/results/page.tsx": [
        'const pricingHref = configuratorRolloutHref("/pricing");',
        "href={pricingHref}",
        "onClick={() => handleCtaClick(pricingHref)}",
      ],
    };

    for (const [path, expressions] of Object.entries(sourceContracts)) {
      const source = readSource(path);
      for (const expression of expressions) {
        expect(source).toContain(expression);
      }
    }
  });

  it("preserves legacy purchase and recovery paths outside the rollout helper", () => {
    const thanksPage = readSource("app/buy/thanks/page.tsx");
    expect(thanksPage).toContain('href="https://app.nexsteps.dev"');
    expect(thanksPage).not.toContain("configuratorRolloutHref");

    const cancelledPage = readSource("app/buy/cancelled/page.tsx");
    expect(cancelledPage).toContain('href="/configure"');
    expect(cancelledPage).not.toContain("configuratorRolloutHref");

    const orderConfirmation = readSource(
      "components/order-confirmation-modal.tsx",
    );
    expect(orderConfirmation).toContain('href="https://app.nexsteps.dev"');
    expect(orderConfirmation).not.toContain("configuratorRolloutHref");
  });

  it("redirects the retired pricing and buy routes to the configurator", () => {
    const nextConfig = readSource("next.config.mjs");

    expect(nextConfig).toContain(
      '{ source: "/pricing", destination: "/configure", permanent: false }',
    );
    expect(nextConfig).toContain(
      '{ source: "/buy", destination: "/configure", permanent: false }',
    );
    // /buy/thanks and /buy/cancelled are live Stripe success/cancel return
    // URLs (see app/configure/page.tsx). Guard against a future refactor
    // widening the /buy redirect into a wildcard that would swallow them.
    expect(nextConfig).not.toContain('"/buy/:path');
  });

  it("uses the existing danger tokens for summary checkout errors", () => {
    const summary = readSource("app/configure/steps/summary.tsx");

    expect(summary).toContain("bg-status-danger/10");
    expect(summary).toContain("text-status-danger");
    expect(summary).not.toContain("status-error");
  });

  it("does not expose legacy checkout on the institutional estimator", () => {
    const configurePage = readSource("app/configure/page.tsx");
    expect(configurePage).toContain(
      "New-plan checkout is currently unavailable.",
    );
    expect(configurePage).not.toContain("createCheckoutSession");
    expect(configurePage).not.toContain("buildCheckoutPayload");
  });

  it("builds checkout payloads with included and paid modules kept distinct", () => {
    const checkout = readSource("lib/configurator-checkout.ts");

    expect(checkout).toContain(
      "selectedModules: state.selectedOptionalModules",
    );
    expect(checkout).toContain("selectedIncludedModules:");
    expect(checkout).toContain("state.selectedIncludedModules");
  });
});
