import { BillingProvider, Module, ModuleChangeStatus, SubscriptionStatus } from "@pathway/db";
import { isConfiguratorModuleReady } from "@pathway/pricing";
import type Stripe from "stripe";
import { ModuleChangeService } from "../module-change.service";
import { scheduleModuleChange, scheduleSubscriptionCancellation } from "../module-change-schedule";
import type { BillingProviderConfig } from "../billing-provider.config";

const tx = {
  subscription: { findFirst: jest.fn() },
  moduleGrant: { findMany: jest.fn() },
  moduleChange: {
    findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn(),
  },
};

jest.mock("@pathway/db", () => ({
  ...jest.requireActual("@pathway/db"),
  get prisma() { return { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) }; },
  applyTenantContext: jest.fn(),
  withOrgRlsContext: (_orgId: string, callback: (client: typeof tx) => unknown) => callback(tx),
}));
jest.mock("@pathway/pricing", () => ({
  ...jest.requireActual("@pathway/pricing"),
  isConfiguratorModuleReady: jest.fn(() => true),
}));
jest.mock("../module-change-schedule", () => ({
  scheduleModuleChange: jest.fn(),
  scheduleSubscriptionCancellation: jest.fn(),
}));

const renewal = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
const subscription = {
  id: "sub_1",
  status: "active",
  cancel_at_period_end: false,
  current_period_end: renewal,
  items: { data: [{ price: { id: "price_growth", unit_amount: 9900 }, quantity: 1 }] },
} as unknown as Stripe.Subscription;

const config: BillingProviderConfig = {
  activeProvider: "STRIPE_TEST",
  stripe: {
    secretKey: "sk_test_placeholder",
    priceMap: {
      GROWTH_99_MONTHLY: "price_growth",
      MODULE_FINANCE_MONTHLY: "price_finance",
    },
  },
  goCardless: {},
};

function service(addon?: Stripe.Subscription): ModuleChangeService {
  const instance = new ModuleChangeService(config);
  const stripe = {
    subscriptions: { retrieve: jest.fn(async (id: string) =>
      id === "sub_addon" && addon ? addon : subscription) },
    prices: { retrieve: jest.fn().mockResolvedValue({
      id: "price_growth", active: true, currency: "gbp",
      recurring: { interval: "month", interval_count: 1 }, unit_amount: 9900,
    }) },
  };
  // The service owns the SDK client; this replaces only its network boundary.
  (instance as unknown as { stripe: typeof stripe }).stripe = stripe;
  return instance;
}

describe("module change service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isConfiguratorModuleReady as jest.Mock).mockReturnValue(true);
    tx.subscription.findFirst.mockResolvedValue({
      provider: BillingProvider.STRIPE,
      providerSubId: "sub_1",
      planCode: "GROWTH_99_MONTHLY",
      status: SubscriptionStatus.ACTIVE,
    });
    tx.moduleGrant.findMany.mockResolvedValue([]);
    tx.moduleChange.findFirst.mockResolvedValue(null);
    tx.moduleChange.create.mockImplementation(async ({ data }) => ({
      id: "change_1", status: ModuleChangeStatus.PREVIEW, ...data,
    }));
  });

  it("quotes an included-only same-plan change without a new charge", async () => {
    const preview = await service().preview("org_1", {
      planCode: "GROWTH_99_MONTHLY",
      includedModules: [Module.FINANCE],
      paidModules: [],
    });
    expect(preview).toMatchObject({
      includedModules: [Module.FINANCE], paidModules: [], subtotalPence: 9900,
    });
    expect(tx.moduleChange.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerItems: expect.objectContaining({
          current: [{ price: "price_growth", quantity: 1 }],
          next: [{ price: "price_growth", quantity: 1 }],
        }),
      }),
    }));
  });

  it("rejects unavailable modules even in included slots", async () => {
    (isConfiguratorModuleReady as jest.Mock).mockReturnValue(false);
    await expect(service().preview("org_1", {
      planCode: "GROWTH_99_MONTHLY",
      includedModules: [Module.FINANCE],
      paidModules: [],
    })).rejects.toThrow("not yet available");
    expect(tx.moduleChange.create).not.toHaveBeenCalled();
  });

  it("preserves a previously granted module while new offers remain closed", async () => {
    (isConfiguratorModuleReady as jest.Mock).mockReturnValue(false);
    tx.moduleGrant.findMany.mockResolvedValue([
      { module: Module.FINANCE, expiresAt: null, source: "PAID_ADDON", sourceId: "sub_1" },
    ]);
    const preview = await service().preview("org_1", {
      planCode: "GROWTH_99_MONTHLY",
      includedModules: [Module.FINANCE],
      paidModules: [],
    });
    expect(preview.includedModules).toEqual([Module.FINANCE]);
  });

  it("removes a separately billed module fee at the same renewal boundary", async () => {
    (isConfiguratorModuleReady as jest.Mock).mockReturnValue(false);
    tx.moduleGrant.findMany.mockResolvedValue([
      { module: Module.FINANCE, expiresAt: null,
        source: "PAID_ADDON", sourceId: "sub_addon" },
    ]);
    const addon = {
      ...subscription,
      id: "sub_addon",
      current_period_end: renewal + 7 * 24 * 60 * 60,
      items: { data: [{ price: { id: "price_finance", unit_amount: 1900 }, quantity: 1 }] },
    } as unknown as Stripe.Subscription;

    const preview = await service(addon).preview("org_1", {
      planCode: "GROWTH_99_MONTHLY",
      includedModules: [Module.FINANCE],
      paidModules: [],
    });
    expect(preview.subtotalPence).toBe(9900);
    const saved = tx.moduleChange.create.mock.calls[0][0].data;
    expect(saved.providerItems.retiredSources).toEqual([expect.objectContaining({
      sourceId: "sub_addon",
      modules: [Module.FINANCE],
      current: [{ price: "price_finance", quantity: 1 }],
      next: [],
    })]);

    const change = {
      id: "change_1", orgId: "org_1", providerSubId: "sub_1",
      planCode: "GROWTH_99_MONTHLY", includedModules: [Module.FINANCE],
      paidModules: [], subtotalPence: 9900,
      providerItems: saved.providerItems,
      effectiveAt: new Date(renewal * 1000),
      expiresAt: new Date(Date.now() + 15 * 60_000),
      status: ModuleChangeStatus.PREVIEW, idempotencyKey: null,
    };
    tx.moduleChange.findFirst.mockResolvedValue(change);
    tx.moduleChange.updateMany.mockResolvedValue({ count: 1 });
    tx.moduleChange.update.mockResolvedValue({ ...change, status: ModuleChangeStatus.SCHEDULED });
    (scheduleSubscriptionCancellation as jest.Mock).mockResolvedValue("sched_addon");
    (scheduleModuleChange as jest.Mock).mockResolvedValue("sched_base");
    await service(addon).accept("org_1", "change_1", "request_2");
    expect(scheduleSubscriptionCancellation).toHaveBeenCalledWith(expect.anything(),
      "sub_addon", change.effectiveAt, "change_1:sub_addon");
  });

  it("accepts a saved preview once and schedules its renewal", async () => {
    const change = {
      id: "change_1", orgId: "org_1", providerSubId: "sub_1",
      planCode: "GROWTH_99_MONTHLY", includedModules: [Module.FINANCE],
      paidModules: [], subtotalPence: 9900,
      providerItems: { current: [{ price: "price_growth", quantity: 1 }],
        next: [{ price: "price_growth", quantity: 1 }] },
      effectiveAt: new Date(renewal * 1000),
      expiresAt: new Date(Date.now() + 15 * 60_000),
      status: ModuleChangeStatus.PREVIEW, idempotencyKey: null,
    };
    tx.moduleChange.findFirst.mockResolvedValue(change);
    tx.moduleChange.updateMany.mockResolvedValue({ count: 1 });
    tx.moduleChange.update.mockResolvedValue({
      ...change, status: ModuleChangeStatus.SCHEDULED, providerScheduleId: "sched_1",
    });
    (scheduleModuleChange as jest.Mock).mockResolvedValue("sched_1");

    const result = await service().accept("org_1", "change_1", "request_1");
    expect(result.status).toBe(ModuleChangeStatus.SCHEDULED);
    expect(scheduleModuleChange).toHaveBeenCalledWith(expect.anything(), "sub_1",
      change.effectiveAt, change.providerItems.next, "change_1", change.planCode);
    expect(tx.moduleChange.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "change_1", orgId: "org_1", status: ModuleChangeStatus.PREVIEW },
      data: expect.objectContaining({ idempotencyKey: "request_1" }),
    }));
  });
});
