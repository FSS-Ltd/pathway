import { BuyNowService, TIER_HIERARCHY } from "../buy-now.service";
import { PlanPreviewService } from "../plan-preview.service";
import { BuyNowProvider } from "../buy-now.provider";
import { BillingProvider, Module, OrgRole } from "@pathway/db";
import { type BillingProviderConfig } from "../billing-provider.config";
import type { PathwayRequestContext } from "@pathway/auth";
import { Auth0ManagementService } from "../../auth/auth0-management.service";

const prismaMock = {
  pendingOrder: { create: jest.fn(), update: jest.fn() },
  orgMembership: { findUnique: jest.fn() },
  org: { findUnique: jest.fn() },
  subscription: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
};

jest.mock("@pathway/db", () => {
  const actual = jest.requireActual("@pathway/db");
  return {
    ...actual,
    get prisma() {
      return prismaMock;
    },
  };
});

describe("BuyNowService", () => {
  const previewService = new PlanPreviewService();
  const providerMock: jest.Mocked<BuyNowProvider> = {
    createCheckoutSession: jest.fn() as jest.MockedFunction<
      BuyNowProvider["createCheckoutSession"]
    >,
  };
  const contextMock: Partial<PathwayRequestContext> = {
    currentOrgId: "org_1",
    currentTenantId: "tenant_1",
  };
  const providerConfig: BillingProviderConfig = {
    activeProvider: "FAKE",
    stripe: {},
    goCardless: {},
  };

  const auth0ManagementMock: Partial<Auth0ManagementService> = {
    createUser: jest.fn().mockResolvedValue("auth0|123456"),
  };

  const baseRequest = {
    org: {
      orgName: "Test Org",
      contactName: "Alice Doe",
      contactEmail: "alice@example.com",
      password: "test-password-123",
    },
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
  };

  beforeEach(() => {
    providerMock.createCheckoutSession.mockReset();
    prismaMock.pendingOrder.create.mockReset();
    prismaMock.pendingOrder.update.mockReset();
    prismaMock.orgMembership.findUnique.mockReset();
    prismaMock.org.findUnique.mockReset();
    prismaMock.subscription.findFirst.mockReset();
    prismaMock.user.findUnique.mockReset();
    providerMock.createCheckoutSession.mockResolvedValue({
      provider: "fake",
      sessionId: "fake_session",
      sessionUrl: "https://example.test/checkout/fake_session",
    });
    prismaMock.pendingOrder.create.mockResolvedValue({
      id: "po_1",
      tenantId: contextMock.currentTenantId,
      orgId: contextMock.currentOrgId,
    });
    prismaMock.pendingOrder.update.mockResolvedValue({});
    prismaMock.orgMembership.findUnique.mockResolvedValue({
      role: OrgRole.ORG_ADMIN,
    });
    prismaMock.org.findUnique.mockResolvedValue({ isMasterOrg: false });
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({
      email: "alice@example.com",
      name: "Alice Doe",
    });
  });

  it("computes preview caps for known plan and calls provider", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    const result = await service.checkout({
      ...baseRequest,
      plan: { planCode: "STARTER_MONTHLY", av30AddonBlocks: 2 },
    });

    expect(providerMock.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ pendingOrderId: "po_1" }),
      expect.objectContaining({ orgId: "org_1", tenantId: "tenant_1" }),
    );
    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: contextMock.currentTenantId,
          orgId: contextMock.currentOrgId,
          planCode: "STARTER_MONTHLY",
          provider: BillingProvider.STRIPE,
        }),
      }),
    );
    expect(prismaMock.pendingOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "po_1" },
        data: { providerCheckoutId: "fake_session" },
      }),
    );
    expect(result.preview.av30Cap).toBe(100); // 50 base + 2*25
    expect(result.preview.maxChildren).toBeNull();
    expect(result.preview.maxSites).toBe(1);
    expect(result.warnings).toContain("price_not_included");
    expect(result.warnings).not.toContain("unknown_plan_code");
  });

  it("rejects an unknown public plan before creating a pending order", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await expect(
      service.checkout({
        ...baseRequest,
        plan: { planCode: "LEGACY_UNKNOWN", av30AddonBlocks: 2 },
      }),
    ).rejects.toThrow("Invalid plan code");

    expect(prismaMock.pendingOrder.create).not.toHaveBeenCalled();
    expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("normalises negative add-ons to zero", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    const result = await service.checkout({
      ...baseRequest,
      plan: { planCode: "STARTER_MONTHLY", av30AddonBlocks: -5 },
    });

    expect(result.preview.av30Cap).toBe(50); // base only, add-ons clamped
    expect(providerMock.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("blocks core capacity add-ons but keeps non-capacity add-ons", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    const result = await service.checkout({
      ...baseRequest,
      plan: {
        planCode: "CORE_MONTHLY",
        av30AddonBlocks: 2,
        extraSites: 1,
        extraStorageGb: 100,
        extraSmsMessages: 1000,
      },
    });

    expect(result.preview.av30Cap).toBe(15);
    expect(result.preview.maxChildren).toBe(50);
    expect(result.preview.maxSites).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "core_capacity_addon_blocked_av30",
        "core_capacity_addon_blocked_sites",
      ]),
    );
  });

  it("persists selected modules and passes them to the provider for public checkout", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await service.checkout({
      ...baseRequest,
      plan: {
        planCode: "STARTER_MONTHLY",
        selectedModules: [Module.FINANCE, Module.EVENTS],
      },
    });

    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectedModules: [Module.FINANCE, Module.EVENTS],
        }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          selectedModules: [Module.FINANCE, Module.EVENTS],
        }),
      }),
      expect.anything(),
    );
  });

  it("strips included modules and deduplicates eligible paid modules for public checkout", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await service.checkout({
      ...baseRequest,
      plan: {
        planCode: "GROWTH_99_MONTHLY",
        selectedModules: [
          Module.FINANCE,
          Module.TRANSPORT,
          Module.TRANSPORT,
          Module.EVENTS,
        ],
      },
    });

    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ selectedModules: [Module.TRANSPORT] }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ selectedModules: [Module.TRANSPORT] }),
      }),
      expect.anything(),
    );
  });

  it("normalizes CORE before resolving modules for public checkout", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await service.checkout({
      ...baseRequest,
      plan: {
        planCode: "CORE_MONTHLY",
        selectedModules: [Module.FINANCE],
      },
    });

    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planCode: "MINIMUM_MONTHLY",
          selectedModules: [Module.FINANCE],
        }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          planCode: "MINIMUM_MONTHLY",
          selectedModules: [Module.FINANCE],
        }),
      }),
      expect.anything(),
    );
  });

  it("rejects contact-only public plans before creating a pending order", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await expect(
      service.checkout({
        ...baseRequest,
        plan: { planCode: "ENTERPRISE_CONTACT" },
      }),
    ).rejects.toThrow("requires contact with sales");

    expect(prismaMock.pendingOrder.create).not.toHaveBeenCalled();
    expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("permits a same-plan module-only purchase and persists its selection", async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      planCode: "STARTER_MONTHLY",
    });
    prismaMock.org.findUnique
      .mockResolvedValueOnce({ isMasterOrg: false })
      .mockResolvedValueOnce({
        name: "Test Org",
        stripeCustomerId: "cus_123",
      });

    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await service.purchaseForOrg(
      {
        planCode: "STARTER_MONTHLY",
        selectedModules: [Module.FINANCE],
      },
      { orgId: "org_1", tenantId: "tenant_1", userId: "user_1" },
    );

    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ selectedModules: [Module.FINANCE] }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        addonsOnly: true,
        plan: expect.objectContaining({ selectedModules: [Module.FINANCE] }),
      }),
      expect.anything(),
    );
  });

  it("strips included modules and deduplicates eligible paid modules for authenticated checkout", async () => {
    prismaMock.org.findUnique
      .mockResolvedValueOnce({ isMasterOrg: false })
      .mockResolvedValueOnce({ name: "Test Org", stripeCustomerId: "cus_123" });

    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await service.purchaseForOrg(
      {
        planCode: "GROWTH_99_MONTHLY",
        selectedModules: [
          Module.FINANCE,
          Module.TRANSPORT,
          Module.TRANSPORT,
          Module.EVENTS,
        ],
      },
      { orgId: "org_1", tenantId: "tenant_1", userId: "user_1" },
    );

    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ selectedModules: [Module.TRANSPORT] }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ selectedModules: [Module.TRANSPORT] }),
      }),
      expect.anything(),
    );
  });

  it("normalizes CORE before resolving modules for authenticated checkout", async () => {
    prismaMock.org.findUnique
      .mockResolvedValueOnce({ isMasterOrg: false })
      .mockResolvedValueOnce({ name: "Test Org", stripeCustomerId: "cus_123" });

    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await service.purchaseForOrg(
      { planCode: "CORE_MONTHLY", selectedModules: [Module.FINANCE] },
      { orgId: "org_1", tenantId: "tenant_1", userId: "user_1" },
    );

    expect(prismaMock.pendingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planCode: "MINIMUM_MONTHLY",
          selectedModules: [Module.FINANCE],
        }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          planCode: "MINIMUM_MONTHLY",
          selectedModules: [Module.FINANCE],
        }),
      }),
      expect.anything(),
    );
  });

  it("rejects an included-only same-plan purchase without creating a pending order", async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      planCode: "GROWTH_99_MONTHLY",
    });

    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await expect(
      service.purchaseForOrg(
        {
          planCode: "GROWTH_99_MONTHLY",
          selectedModules: [Module.FINANCE, Module.EVENTS],
        },
        { orgId: "org_1", tenantId: "tenant_1", userId: "user_1" },
      ),
    ).rejects.toThrow("already on this plan");

    expect(prismaMock.pendingOrder.create).not.toHaveBeenCalled();
    expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects authenticated contact-only plans before creating a pending order", async () => {
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      providerConfig,
    );

    await expect(
      service.purchaseForOrg(
        { planCode: "ENTERPRISE_CONTACT" },
        { orgId: "org_1", tenantId: "tenant_1", userId: "user_1" },
      ),
    ).rejects.toThrow("requires contact with sales");

    expect(prismaMock.pendingOrder.create).not.toHaveBeenCalled();
    expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects paid module selections for GoCardless before creating a pending order", async () => {
    const goCardlessConfig: BillingProviderConfig = {
      activeProvider: "GOCARDLESS",
      stripe: {},
      goCardless: {},
    };
    const service = new BuyNowService(
      previewService,
      providerMock,
      auth0ManagementMock as Auth0ManagementService,
      contextMock as PathwayRequestContext,
      goCardlessConfig,
    );

    await expect(
      service.checkout({
        ...baseRequest,
        plan: {
          planCode: "GROWTH_99_MONTHLY",
          selectedModules: [Module.TRANSPORT],
        },
      }),
    ).rejects.toThrow("not supported by the active billing provider");

    expect(prismaMock.pendingOrder.create).not.toHaveBeenCalled();
    expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each(["STRIPE", "STRIPE_TEST"] as const)(
    "rejects a %s selection for a module without a configured price",
    async (activeProvider) => {
      const stripeConfig: BillingProviderConfig = {
        activeProvider,
        stripe: { priceMap: { STARTER_MONTHLY: "price_starter" } },
        goCardless: {},
      };
      const service = new BuyNowService(
        previewService,
        providerMock,
        auth0ManagementMock as Auth0ManagementService,
        contextMock as PathwayRequestContext,
        stripeConfig,
      );

      await expect(
        service.checkout({
          ...baseRequest,
          plan: {
            planCode: "STARTER_MONTHLY",
            selectedModules: [Module.LEARNING],
          },
        }),
      ).rejects.toThrow(
        "Missing Stripe price configuration for selected modules",
      );

      expect(prismaMock.pendingOrder.create).not.toHaveBeenCalled();
      expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
    },
  );
});

describe("TIER_HIERARCHY (Phase 0 PR 0.2)", () => {
  it("places professional strictly between growth and enterprise", () => {
    expect(TIER_HIERARCHY.professional).toBeGreaterThan(TIER_HIERARCHY.growth);
    expect(TIER_HIERARCHY.professional).toBeLessThan(TIER_HIERARCHY.enterprise);
  });

  it("preserves the existing core < starter < growth ordering", () => {
    expect(TIER_HIERARCHY.core).toBeLessThan(TIER_HIERARCHY.starter);
    expect(TIER_HIERARCHY.starter).toBeLessThan(TIER_HIERARCHY.growth);
  });
});
