import { BadRequestException } from "@nestjs/common";
import { BillingWebhookController } from "../webhook.controller";
import {
  BillingWebhookProvider,
  ParsedBillingWebhookEvent,
} from "../billing-webhook.provider";
import { EntitlementsService } from "../entitlements.service";
import { ModuleRef } from "@nestjs/core";
import { LoggingService } from "../../common/logging/logging.service";
import type { BillingProviderConfig } from "../billing-provider.config";
import {
  BillingProvider,
  Module,
  ModuleStatus,
  SubscriptionStatus,
  PendingOrderStatus,
} from "@pathway/db";

const prismaMock: {
  billingEvent: { findFirst: jest.Mock; create: jest.Mock };
  subscription: { upsert: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  orgEntitlementSnapshot: { create: jest.Mock };
  orgModule: { upsert: jest.Mock; updateMany: jest.Mock };
  pendingOrder: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
} = {
  billingEvent: { findFirst: jest.fn(), create: jest.fn() },
  subscription: {
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  },
  orgEntitlementSnapshot: { create: jest.fn() },
  orgModule: { upsert: jest.fn(), updateMany: jest.fn() },
  pendingOrder: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: typeof prismaMock) => unknown) =>
    Promise.resolve(cb(prismaMock)),
  ),
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

describe("BillingWebhookController", () => {
  const baseEvent: ParsedBillingWebhookEvent = {
    provider: BillingProvider.STRIPE,
    eventId: "evt_123",
    kind: "subscription.updated",
    orgId: "org_1",
    subscriptionId: "sub_1",
    planCode: "pro",
    status: SubscriptionStatus.ACTIVE,
    periodStart: new Date("2024-01-01T00:00:00Z"),
    periodEnd: new Date("2024-02-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
    entitlements: {
      av30Included: 50,
      leaderSeatsIncluded: 10,
      storageGbIncluded: 100,
      maxSites: 2,
    },
  };

  let controller: BillingWebhookController;
  let provider: BillingWebhookProvider;
  let entitlements: jest.Mocked<Pick<EntitlementsService, "resolve">>;
  const logging = new LoggingService();

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
    prismaMock.pendingOrder.findFirst.mockResolvedValue(null);

    provider = {
      verifyAndParse: jest
        .fn()
        .mockResolvedValue(baseEvent) as jest.MockedFunction<
        BillingWebhookProvider["verifyAndParse"]
      >,
    };
    entitlements = {
      resolve: jest.fn().mockResolvedValue(baseEvent),
    };

    const auth0Management = {
      createUser: jest.fn().mockResolvedValue("auth0|123"),
      isReady: jest.fn().mockReturnValue(true),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(auth0Management),
    } as unknown as ModuleRef;

    const billingConfig: BillingProviderConfig = {
      activeProvider: "STRIPE",
      stripe: {},
      goCardless: {},
    };

    controller = new BillingWebhookController(
      provider as unknown as BillingWebhookProvider,
      entitlements as unknown as EntitlementsService,
      moduleRef,
      billingConfig,
      logging,
    );
  });

  it("handles subscription update and records billing event", async () => {
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);

    const result = await controller.handleWebhook(
      { dummy: true },
      "test-signature",
    );

    expect(result.status).toBe("ok");
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.orgEntitlementSnapshot.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadJson: expect.objectContaining({ eventId: baseEvent.eventId }),
        }),
      }),
    );
    expect(entitlements.resolve).toHaveBeenCalledWith(baseEvent.orgId);
  });

  it("skips duplicate events idempotently", async () => {
    prismaMock.billingEvent.findFirst.mockResolvedValue({ id: "existing" });

    const result = await controller.handleWebhook(
      { dummy: true },
      "test-signature",
    );

    expect(result.status).toBe("ignored_duplicate");
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled();
    expect(entitlements.resolve).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures", async () => {
    (provider.verifyAndParse as jest.Mock).mockRejectedValue(
      new BadRequestException("Invalid"),
    );

    await expect(
      controller.handleWebhook({ dummy: true }, "bad-signature"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ignores unknown event types but still records the event", async () => {
    const unknownEvent: ParsedBillingWebhookEvent = {
      ...baseEvent,
      eventId: "evt_unknown",
      kind: "unknown",
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue(unknownEvent);
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);

    const result = await controller.handleWebhook(
      { dummy: true },
      "test-signature",
    );

    expect(result.status).toBe("ignored_unknown");
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.orgEntitlementSnapshot.create).not.toHaveBeenCalled();
    expect(prismaMock.billingEvent.create).toHaveBeenCalled();
  });

  it("applies pending order caps and completes the order", async () => {
    const pending = {
      id: "po_1",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "pro",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      flags: { note: "from preview" },
      warnings: ["price_not_included"],
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_1",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    const eventWithPending: ParsedBillingWebhookEvent = {
      ...baseEvent,
      pendingOrderId: pending.id,
    };
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    (provider.verifyAndParse as jest.Mock).mockResolvedValue(eventWithPending);

    const result = await controller.handleWebhook(
      { dummy: true },
      "test-signature",
    );

    expect(result.status).toBe("ok");
    expect(prismaMock.subscription.upsert).toHaveBeenCalled();
    expect(prismaMock.orgEntitlementSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: baseEvent.orgId,
          av30Included: pending.av30Cap,
          maxSites: pending.maxSites,
          storageGbIncluded: pending.storageGbCap,
          leaderSeatsIncluded: pending.leaderSeatsIncluded,
        }),
      }),
    );
    expect(prismaMock.pendingOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pending.id },
        data: expect.objectContaining({
          status: PendingOrderStatus.COMPLETED,
          providerSubscriptionId: baseEvent.subscriptionId,
        }),
      }),
    );
  });

  it("activates selected modules when a pending order completes", async () => {
    const pending = {
      id: "po_modules",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "pro",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [Module.FINANCE, Module.EVENTS],
      flags: null,
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_1",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_module: { orgId: baseEvent.orgId, module: Module.FINANCE },
        },
        create: expect.objectContaining({
          status: ModuleStatus.ACTIVE,
          expiresAt: baseEvent.periodEnd,
          metadata: {
            billingSource: "subscription",
            subscriptionId: baseEvent.subscriptionId,
          },
        }),
        update: expect.objectContaining({
          status: ModuleStatus.ACTIVE,
          expiresAt: baseEvent.periodEnd,
        }),
      }),
    );
    const firstActivation = prismaMock.orgModule.upsert.mock.calls[0][0];
    expect(firstActivation.update).not.toHaveProperty("activatedAt");
  });

  it("extends active module expiry on a renewal without creating modules", async () => {
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.updateMany).toHaveBeenCalledWith({
      where: {
        orgId: baseEvent.orgId,
        status: ModuleStatus.ACTIVE,
        metadata: {
          path: ["subscriptionId"],
          equals: baseEvent.subscriptionId,
        },
      },
      data: { expiresAt: baseEvent.periodEnd },
    });
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
  });
});
