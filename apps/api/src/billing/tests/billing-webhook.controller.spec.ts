import { BadRequestException } from "@nestjs/common";
import { BillingWebhookController } from "../webhook.controller";
import { InstitutionalWebhookService } from "../institutional/institutional-webhook.service";
import { InstitutionalPublicActivationService } from "../institutional/institutional-public-activation.service";
import {
  BillingWebhookProvider,
  ParsedBillingWebhookEvent,
} from "../billing-webhook.provider";
import { EntitlementsService } from "../entitlements.service";
import { ModuleRef } from "@nestjs/core";
import { LoggingService } from "../../common/logging/logging.service";
import type { BillingProviderConfig } from "../billing-provider.config";
import {
  claimBillingEvent,
  finishBillingEvent,
} from "../billing-event-processing";

jest.mock("../billing-event-processing", () => ({
  claimBillingEvent: jest.fn(),
  finishBillingEvent: jest.fn(),
}));
import {
  BillingProvider,
  Module,
  ModuleGrantSource,
  ModuleStatus,
  SubscriptionStatus,
  PendingOrderStatus,
} from "@pathway/db";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";

const prismaMock: {
  billingEvent: { findFirst: jest.Mock; create: jest.Mock };
  subscription: {
    upsert: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  institutionalBillingSnapshot: { findFirst: jest.Mock };
  institutionalQuoteAcceptance: { updateMany: jest.Mock };
  institutionalBillingPolicy: { updateMany: jest.Mock; findUnique: jest.Mock };
  enrolmentRollConfirmation: { findFirst: jest.Mock };
  enrolmentRevision: { findFirst: jest.Mock };
  institutionalBillingOperation: { updateMany: jest.Mock; upsert: jest.Mock };
  org: { update: jest.Mock };
  orgEntitlementSnapshot: { create: jest.Mock; findFirst: jest.Mock };
  orgModule: {
    upsert: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  moduleGrant: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
  moduleChange: { findFirst: jest.Mock; updateMany: jest.Mock };
  pendingOrder: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
} = {
  billingEvent: { findFirst: jest.fn(), create: jest.fn() },
  subscription: {
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  institutionalBillingSnapshot: { findFirst: jest.fn() },
  institutionalQuoteAcceptance: { updateMany: jest.fn() },
  institutionalBillingPolicy: { updateMany: jest.fn(), findUnique: jest.fn() },
  enrolmentRollConfirmation: { findFirst: jest.fn() },
  enrolmentRevision: { findFirst: jest.fn() },
  institutionalBillingOperation: { updateMany: jest.fn(), upsert: jest.fn() },
  org: { update: jest.fn() },
  orgEntitlementSnapshot: { create: jest.fn(), findFirst: jest.fn() },
  orgModule: {
    upsert: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  moduleGrant: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn(),
    upsert: jest.fn(),
  },
  moduleChange: { findFirst: jest.fn(), updateMany: jest.fn() },
  pendingOrder: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  $transaction: jest.fn((cb: (tx: typeof prismaMock) => unknown) =>
    Promise.resolve(cb(prismaMock)),
  ),
  $executeRawUnsafe: jest.fn(),
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
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
    periodStart: new Date("2030-01-01T00:00:00Z"),
    periodEnd: new Date("2030-02-01T00:00:00Z"),
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
  let billingConfig: BillingProviderConfig;
  let publicActivation: jest.Mocked<
    Pick<
      InstitutionalPublicActivationService,
      | "isPublicInstitutionalOrder"
      | "draftInvoiceMatches"
      | "assertPaidInvoice"
      | "attachAcceptedQuote"
    >
  >;
  const logging = new LoggingService();

  beforeEach(() => {
    jest.clearAllMocks();
    (claimBillingEvent as jest.Mock).mockResolvedValue({
      status: "claimed",
      id: "billing_event_1",
    });
    (finishBillingEvent as jest.Mock).mockResolvedValue(undefined);
    const grants: Array<{
      orgId: string;
      module: Module;
      source: ModuleGrantSource;
      sourceId: string;
      status: ModuleStatus;
      expiresAt: Date | null;
    }> = [];
    const matches = (
      grant: (typeof grants)[number],
      where: {
        orgId?: string;
        module?: Module;
        sourceId?: string;
        status?: ModuleStatus;
        source?: { in: ModuleGrantSource[] };
      },
    ) =>
      (!where.orgId || grant.orgId === where.orgId) &&
      (!where.module || grant.module === where.module) &&
      (!where.sourceId || grant.sourceId === where.sourceId) &&
      (!where.status || grant.status === where.status) &&
      (!where.source || where.source.in.includes(grant.source));
    prismaMock.moduleGrant.findMany.mockImplementation(async ({ where }) =>
      grants.filter((grant) => matches(grant, where)),
    );
    prismaMock.moduleGrant.updateMany.mockImplementation(
      async ({ where, data }) => {
        for (const grant of grants.filter((row) => matches(row, where))) {
          Object.assign(grant, data);
        }
      },
    );
    prismaMock.moduleGrant.upsert.mockImplementation(
      async ({ where, create, update }) => {
        const key = where.orgId_module_source_sourceId;
        const existing = grants.find(
          (grant) =>
            grant.orgId === key.orgId &&
            grant.module === key.module &&
            grant.source === key.source &&
            grant.sourceId === key.sourceId,
        );
        if (existing) Object.assign(existing, update);
        else grants.push({ ...create });
      },
    );
    prismaMock.orgModule.findUnique.mockResolvedValue(null);
    prismaMock.moduleChange.findFirst.mockResolvedValue(null);
    prismaMock.moduleChange.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscription.findUnique.mockResolvedValue({
      planCode: "GROWTH_99_MONTHLY",
    });
    prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
    prismaMock.pendingOrder.findFirst.mockResolvedValue(null);
    prismaMock.institutionalBillingSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.subscription.upsert.mockResolvedValue({
      id: "subscription_db_1",
    });

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

    billingConfig = {
      activeProvider: "STRIPE",
      stripe: {},
      goCardless: {},
    };
    publicActivation = {
      isPublicInstitutionalOrder: jest.fn().mockReturnValue(false),
      draftInvoiceMatches: jest.fn().mockReturnValue(true),
      assertPaidInvoice: jest.fn(),
      attachAcceptedQuote: jest.fn(),
    };

    controller = new BillingWebhookController(
      provider as unknown as BillingWebhookProvider,
      entitlements as unknown as EntitlementsService,
      moduleRef,
      billingConfig,
      new InstitutionalWebhookService(provider, billingConfig),
      publicActivation as InstitutionalPublicActivationService,
      logging,
    );
  });

  it("does not provision a public institutional order before invoice parity", async () => {
    const paidEvent: ParsedBillingWebhookEvent = {
      ...baseEvent,
      kind: "invoice.paid",
      orgId: "",
      pendingOrderId: "order_1",
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue(paidEvent);
    prismaMock.pendingOrder.findUnique.mockResolvedValue({
      id: "order_1",
      orgId: null,
      institutionalSnapshotId: null,
      status: PendingOrderStatus.PENDING,
    });
    publicActivation.isPublicInstitutionalOrder.mockReturnValue(true);
    publicActivation.assertPaidInvoice.mockImplementation(() => {
      throw new Error("Invoice mismatch");
    });

    await expect(
      controller.handleWebhook({ dummy: true }, "test-signature"),
    ).rejects.toThrow("Invoice mismatch");
    expect(publicActivation.attachAcceptedQuote).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(finishBillingEvent).toHaveBeenCalledWith(
      "billing_event_1",
      "",
      false,
    );
  });

  it("holds a mismatched public institutional draft invoice", async () => {
    const draftEvent: ParsedBillingWebhookEvent = {
      ...baseEvent,
      kind: "invoice.draft",
      orgId: "",
      pendingOrderId: "order_1",
      invoice: {
        id: "in_draft",
        status: "draft",
        currency: "gbp",
        linesComplete: true,
        lines: [],
      },
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue(draftEvent);
    provider.holdDraftInvoice = jest.fn().mockResolvedValue(undefined);
    prismaMock.pendingOrder.findUnique.mockResolvedValue({
      id: "order_1",
      orgId: null,
      institutionalSnapshotId: null,
      status: PendingOrderStatus.PENDING,
    });
    publicActivation.isPublicInstitutionalOrder.mockReturnValue(true);
    publicActivation.draftInvoiceMatches.mockReturnValue(false);

    const result = await controller.handleWebhook(
      { dummy: true },
      "test-signature",
    );
    expect(result.status).toBe("ok");
    expect(provider.holdDraftInvoice).toHaveBeenCalledWith("in_draft");
    expect(publicActivation.attachAcceptedQuote).not.toHaveBeenCalled();
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
    expect(claimBillingEvent).toHaveBeenCalledWith(baseEvent);
    expect(finishBillingEvent).toHaveBeenCalledWith(
      "billing_event_1",
      baseEvent.orgId,
      true,
    );
    expect(entitlements.resolve).toHaveBeenCalledWith(baseEvent.orgId);
  });

  it("skips duplicate events idempotently", async () => {
    (claimBillingEvent as jest.Mock).mockResolvedValue({ status: "duplicate" });

    const result = await controller.handleWebhook(
      { dummy: true },
      "test-signature",
    );

    expect(result.status).toBe("ignored_duplicate");
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
    expect(finishBillingEvent).not.toHaveBeenCalled();
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
    expect(finishBillingEvent).toHaveBeenCalledWith(
      "billing_event_1",
      baseEvent.orgId,
      true,
    );
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
      kind: "invoice.paid",
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

  it("activates three customer-selected Growth inclusions plus paid extras", async () => {
    const pending = {
      id: "po_modules",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [
        Module.FINANCE,
        Module.EVENTS,
        Module.TRANSPORT,
        Module.MEALS,
      ],
      flags: {
        moduleSelection: {
          includedModules: [Module.FINANCE, Module.EVENTS, Module.TRANSPORT],
        },
      },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_1",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(4);
    expect(
      prismaMock.orgModule.upsert.mock.calls.map(
        ([args]) => args.where.orgId_module.module,
      ),
    ).toEqual([Module.FINANCE, Module.EVENTS, Module.TRANSPORT, Module.MEALS]);
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_module: { orgId: baseEvent.orgId, module: Module.FINANCE },
        },
        create: expect.objectContaining({
          status: ModuleStatus.ACTIVE,
          expiresAt: baseEvent.periodEnd,
          metadata: expect.objectContaining({
            billingSource: "subscription",
            subscriptionId: baseEvent.subscriptionId,
          }),
        }),
        update: expect.objectContaining({
          status: ModuleStatus.ACTIVE,
          expiresAt: baseEvent.periodEnd,
        }),
      }),
    );
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_module: { orgId: baseEvent.orgId, module: Module.MEALS },
        },
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            billingSource: "subscription",
            subscriptionId: baseEvent.subscriptionId,
          }),
        }),
      }),
    );
    expect(
      prismaMock.moduleGrant.upsert.mock.calls.map(
        ([args]) => args.create.source,
      ),
    ).toEqual([
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PAID_ADDON,
    ]);
    const firstActivation = prismaMock.orgModule.upsert.mock.calls[0][0];
    expect(firstActivation.update).not.toHaveProperty("activatedAt");
  });

  it("keeps the base subscription and activates only purchased modules for an add-on order", async () => {
    const pending = {
      id: "po_growth_add_on",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [Module.TRANSPORT],
      flags: { purchaseKind: "add-on" },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_add_on",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      subscriptionId: "sub_add_on",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          planCode: "ADD_ON:GROWTH_99_MONTHLY",
        }),
        create: expect.objectContaining({
          planCode: "ADD_ON:GROWTH_99_MONTHLY",
        }),
      }),
    );
    expect(prismaMock.subscription.findMany).not.toHaveBeenCalled();
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_module: {
            orgId: baseEvent.orgId,
            module: Module.TRANSPORT,
          },
        },
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            billingSource: "subscription",
            subscriptionId: "sub_add_on",
          }),
        }),
      }),
    );
    expect(prismaMock.moduleGrant.upsert.mock.calls[0][0].create.source).toBe(
      ModuleGrantSource.PAID_ADDON,
    );
  });

  it("waits for an active event before completing and provisioning a pending order", async () => {
    const pending = {
      id: "po_out_of_order",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [Module.TRANSPORT],
      flags: null,
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_out_of_order",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);
    (provider.verifyAndParse as jest.Mock).mockResolvedValueOnce({
      ...baseEvent,
      eventId: "evt_incomplete",
      status: SubscriptionStatus.PAST_DUE,
      pendingOrderId: pending.id,
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.pendingOrder.update).not.toHaveBeenCalled();
    expect(prismaMock.orgEntitlementSnapshot.create).not.toHaveBeenCalled();
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();

    (provider.verifyAndParse as jest.Mock).mockResolvedValueOnce({
      ...baseEvent,
      eventId: "evt_active",
      kind: "invoice.paid",
      status: SubscriptionStatus.ACTIVE,
      pendingOrderId: pending.id,
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.pendingOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pending.id },
        data: expect.objectContaining({ status: PendingOrderStatus.COMPLETED }),
      }),
    );
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(4);
  });

  it("records add-on payment failures without changing base subscription state", async () => {
    const pending = {
      id: "po_add_on_failed",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      selectedModules: [Module.TRANSPORT],
      flags: { purchaseKind: "add-on" },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_add_on_failed",
      providerSubscriptionId: "sub_add_on_failed",
      status: PendingOrderStatus.COMPLETED,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      eventId: "evt_add_on_failed",
      kind: "invoice.payment_failed",
      status: SubscriptionStatus.PAST_DUE,
      subscriptionId: pending.providerSubscriptionId,
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          planCode: "ADD_ON:GROWTH_99_MONTHLY",
          status: SubscriptionStatus.PAST_DUE,
        }),
        create: expect.objectContaining({
          planCode: "ADD_ON:GROWTH_99_MONTHLY",
          status: SubscriptionStatus.PAST_DUE,
        }),
      }),
    );
    expect(prismaMock.pendingOrder.update).not.toHaveBeenCalled();
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
  });

  it("does not reactivate modules for an already completed order", async () => {
    const pending = {
      id: "po_completed",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      selectedModules: [Module.TRANSPORT],
      flags: null,
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_completed",
      providerSubscriptionId: baseEvent.subscriptionId,
      status: PendingOrderStatus.COMPLETED,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      eventId: "evt_completed_renewal",
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
    expect(prismaMock.moduleGrant.updateMany).toHaveBeenCalledWith({
      where: { orgId: baseEvent.orgId, sourceId: baseEvent.subscriptionId },
      data: { expiresAt: baseEvent.periodEnd },
    });
  });

  it("cancels persisted add-on subscriptions when a new plan activates", async () => {
    const pending = {
      id: "po_plan_change",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "PROFESSIONAL_149_MONTHLY",
      selectedModules: [],
      flags: null,
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_plan_change",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      eventId: "evt_plan_change",
      kind: "invoice.paid",
      subscriptionId: "sub_new_plan",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);
    prismaMock.subscription.findMany.mockResolvedValue([
      {
        id: "subscription_add_on",
        providerSubId: "sub_old_add_on",
        planCode: "ADD_ON:STARTER_MONTHLY",
      },
    ]);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: baseEvent.orgId,
          providerSubId: { not: "sub_new_plan" },
        }),
      }),
    );
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: "subscription_add_on" },
      data: { status: SubscriptionStatus.CANCELED },
    });
  });

  it("activates six customer-selected Professional inclusions and a paid seventh module", async () => {
    const pending = {
      id: "po_professional_modules",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "PROFESSIONAL_149_YEARLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [
        Module.MEALS,
        Module.AI_WORKSPACE,
        Module.FINANCE,
        Module.TRANSPORT,
        Module.HR,
        Module.EVENTS,
        Module.LEARNING,
      ],
      flags: {
        moduleSelection: {
          includedModules: [
            Module.MEALS,
            Module.AI_WORKSPACE,
            Module.FINANCE,
            Module.TRANSPORT,
            Module.HR,
            Module.EVENTS,
          ],
        },
      },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_1",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(7);
    expect(
      prismaMock.orgModule.upsert.mock.calls.map(
        ([args]) => args.where.orgId_module.module,
      ),
    ).toEqual([
      Module.MEALS,
      Module.AI_WORKSPACE,
      Module.FINANCE,
      Module.TRANSPORT,
      Module.HR,
      Module.EVENTS,
      Module.LEARNING,
    ]);
    expect(
      prismaMock.moduleGrant.upsert.mock.calls.map(
        ([args]) => args.create.source,
      ),
    ).toEqual([
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PAID_ADDON,
    ]);
  });

  it("deduplicates malformed pending selections before applying the included allowance", async () => {
    const pending = {
      id: "po_duplicate_included",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      selectedModules: [
        Module.FINANCE,
        Module.FINANCE,
        Module.EVENTS,
        Module.HR,
      ],
      flags: {
        moduleSelection: {
          includedModules: [
            Module.FINANCE,
            Module.EVENTS,
            Module.ADVANCED_REPORTING,
          ],
        },
      },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_duplicate_included",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(
      prismaMock.orgModule.upsert.mock.calls.map(
        ([args]) => args.where.orgId_module.module,
      ),
    ).toEqual([Module.FINANCE, Module.EVENTS, Module.HR]);
    expect(
      prismaMock.moduleGrant.upsert.mock.calls.map(
        ([args]) => args.create.source,
      ),
    ).toEqual([
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PAID_ADDON,
    ]);
  });

  it("preserves the historical fixed bundle for legacy pending Growth orders", async () => {
    const pending = {
      id: "po_legacy_modules",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [Module.MEALS],
      flags: null,
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_1",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(
      prismaMock.orgModule.upsert.mock.calls.map(
        ([args]) => args.where.orgId_module.module,
      ),
    ).toEqual([
      Module.FINANCE,
      Module.EVENTS,
      Module.ADVANCED_REPORTING,
      Module.MEALS,
    ]);
    expect(
      prismaMock.moduleGrant.upsert.mock.calls.map(
        ([args]) => args.create.source,
      ),
    ).toEqual([
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PLAN,
      ModuleGrantSource.PAID_ADDON,
    ]);
  });

  it("honours an explicitly empty inclusion selection without applying the legacy bundle", async () => {
    const pending = {
      id: "po_empty_inclusions",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_MONTHLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [Module.MEALS],
      flags: { moduleSelection: { includedModules: [] } },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_empty_inclusions",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.orgModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_module: { orgId: baseEvent.orgId, module: Module.MEALS },
        },
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            billingSource: "subscription",
            subscriptionId: baseEvent.subscriptionId,
          }),
        }),
      }),
    );
    expect(prismaMock.moduleGrant.upsert.mock.calls[0][0].create.source).toBe(
      ModuleGrantSource.PAID_ADDON,
    );
  });

  it("deduplicates included and purchased modules with plan source taking precedence", async () => {
    const pending = {
      id: "po_duplicate_modules",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "GROWTH_99_YEARLY",
      av30Cap: 75,
      storageGbCap: 100,
      smsMessagesCap: 500,
      leaderSeatsIncluded: 5,
      maxSites: 2,
      selectedModules: [Module.FINANCE, Module.FINANCE, Module.LEARNING],
      flags: {
        moduleSelection: { includedModules: [Module.FINANCE] },
      },
      warnings: null,
      provider: BillingProvider.STRIPE,
      providerCheckoutId: "co_1",
      providerSubscriptionId: null,
      status: PendingOrderStatus.PENDING,
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: pending.id,
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(2);
    const financeActivation = prismaMock.orgModule.upsert.mock.calls.find(
      ([args]) => args.where.orgId_module.module === Module.FINANCE,
    );
    expect(financeActivation).toBeDefined();
    expect(financeActivation?.[0].create.metadata.grantSources).toEqual([
      { source: ModuleGrantSource.PLAN, sourceId: baseEvent.subscriptionId },
    ]);
    expect(
      prismaMock.orgModule.upsert.mock.calls.filter(
        ([args]) => args.where.orgId_module.module === Module.FINANCE,
      ),
    ).toHaveLength(1);
  });

  it("extends active module expiry on a renewal without creating modules", async () => {
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.moduleGrant.updateMany).toHaveBeenCalledWith({
      where: { orgId: baseEvent.orgId, sourceId: baseEvent.subscriptionId },
      data: { expiresAt: baseEvent.periodEnd },
    });
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
  });

  it("cancels only modules tied to the cancelled subscription", async () => {
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      eventId: "evt_cancelled",
      kind: "subscription.canceled",
    });
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
        }),
      }),
    );
    expect(prismaMock.moduleGrant.updateMany).toHaveBeenCalledWith({
      where: { orgId: baseEvent.orgId, sourceId: baseEvent.subscriptionId },
      data: { status: ModuleStatus.CANCELLED },
    });
    expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
  });

  it("applies a scheduled module swap only after the renewal invoice is paid", async () => {
    const change = {
      id: "change_1",
      planCode: "GROWTH_99_MONTHLY",
      includedModules: [Module.FINANCE],
      paidModules: [Module.MEALS],
      providerItems: {
        retiredSources: [
          {
            sourceId: "sub_addon",
            modules: [Module.FINANCE],
          },
        ],
      },
    };
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.moduleChange.findFirst.mockResolvedValue(change);
    (provider.verifyAndParse as jest.Mock).mockResolvedValueOnce({
      ...baseEvent,
      kind: "subscription.updated",
      eventId: "evt_before_payment",
    });
    await controller.handleWebhook({ dummy: true }, "test-signature");
    expect(prismaMock.moduleChange.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.moduleGrant.upsert).not.toHaveBeenCalled();

    (provider.verifyAndParse as jest.Mock).mockResolvedValueOnce({
      ...baseEvent,
      kind: "invoice.paid",
      eventId: "evt_paid_renewal",
    });
    await controller.handleWebhook({ dummy: true }, "test-signature");
    expect(prismaMock.moduleChange.updateMany).toHaveBeenCalledWith({
      where: { id: change.id, status: "SCHEDULED" },
      data: { status: "APPLIED" },
    });
    expect(
      prismaMock.moduleGrant.upsert.mock.calls.map(
        ([args]) => args.create.source,
      ),
    ).toEqual([ModuleGrantSource.PLAN, ModuleGrantSource.PAID_ADDON]);
    expect(prismaMock.moduleGrant.updateMany).toHaveBeenCalledWith({
      where: {
        orgId: baseEvent.orgId,
        sourceId: "sub_addon",
        source: ModuleGrantSource.PAID_ADDON,
        module: { in: [Module.FINANCE] },
        status: ModuleStatus.ACTIVE,
      },
      data: { status: ModuleStatus.CANCELLED },
    });
  });

  it("updates the paid tier even when a subscription update arrived before the invoice", async () => {
    prismaMock.billingEvent.findFirst.mockResolvedValue(null);
    prismaMock.moduleChange.findFirst.mockResolvedValue({
      id: "change_tier",
      planCode: "GROWTH_99_MONTHLY",
      includedModules: [],
      paidModules: [],
      providerItems: { retiredSources: [] },
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      planCode: "GROWTH_99_MONTHLY",
    });
    prismaMock.orgEntitlementSnapshot.findFirst.mockResolvedValue({
      av30Included: 50,
      maxSites: 1,
      storageGbIncluded: 100,
      leaderSeatsIncluded: 1,
      flagsJson: { planCode: "STARTER_49_MONTHLY" },
    });
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.paid",
      eventId: "evt_paid_tier",
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.orgEntitlementSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: baseEvent.orgId,
        flagsJson: expect.objectContaining({ planCode: "GROWTH_99_MONTHLY" }),
        source: "module_change",
      }),
    });
  });

  function setupInstitutionalPayment(
    kind: "invoice.paid" | "invoice.draft" | "invoice.payment_failed",
  ) {
    const pending = {
      id: "institutional_order_1",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      institutionalSnapshotId: "snapshot_1",
      institutionalCheckoutKey: "checkout_1",
      createdAt: new Date("2030-01-01T00:00:00Z"),
      status: PendingOrderStatus.PENDING,
    };
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const snapshot = {
      id: "snapshot_1",
      orgId: baseEvent.orgId,
      kind: "QUOTE",
      status: "PRICED",
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      pricingVersion: "ENROLLED_CHILDREN_V1",
      countSource: "DECLARED",
      enrolledChildren: 0,
      subtotalPence: 4_900,
      includedModules: [],
      paidModules: [],
      createdAt: new Date("2029-12-31T23:59:00Z"),
      expiresAt: new Date("2030-01-01T00:14:00Z"),
      acceptance: {
        id: "acceptance_1",
        acceptedAt: new Date("2029-12-31T23:59:30Z"),
      },
    };
    prismaMock.institutionalBillingSnapshot.findFirst.mockImplementation(
      async ({ where }) => (where.supersedesId ? null : snapshot),
    );
    prismaMock.institutionalBillingPolicy.findUnique.mockResolvedValue({
      pricingVersion: "ENROLLED_CHILDREN_V1",
      declaredChildren: 0,
      declaredAt: new Date("2029-12-31T23:58:00Z"),
    });
    billingConfig.stripe.priceMap = {
      INSTITUTIONAL_STARTER_MONTHLY: "price_starter123",
    };
    const event: ParsedBillingWebhookEvent = {
      ...baseEvent,
      kind,
      pendingOrderId: pending.id,
      planCode: pending.planCode,
      occurredAt: new Date("2030-01-01T00:01:00Z"),
      invoice: {
        id: "in_1",
        status: kind === "invoice.draft" ? "draft" : "paid",
        currency: "gbp",
        linesComplete: true,
        lines: [
          { priceId: "price_starter123", quantity: 1, amountPence: 4_900 },
        ],
      },
    };
    (provider.verifyAndParse as jest.Mock).mockResolvedValue(event);
    return event;
  }

  it("activates an accepted institutional snapshot only after its invoice is paid and matched", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    event.providerCustomerId = "cus_institutional";

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          currentInstitutionalSnapshotId: "snapshot_1",
        }),
      }),
    );
    expect(prismaMock.pendingOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: "institutional_order_1",
        orgId: baseEvent.orgId,
        status: { not: PendingOrderStatus.COMPLETED },
      },
      data: expect.objectContaining({ status: PendingOrderStatus.COMPLETED }),
    });
    expect(
      prismaMock.institutionalBillingOperation.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kind: "CENSUS_FREEZE" }),
      }),
    );
    expect(prismaMock.org.update).toHaveBeenCalledWith({
      where: { id: baseEvent.orgId },
      data: { stripeCustomerId: "cus_institutional" },
    });
  });

  it("does not activate a declared-capacity trial module before its trial starts", async () => {
    const createdAt = new Date("2030-01-01T00:00:00Z");
    const paidEvent: ParsedBillingWebhookEvent = {
      ...baseEvent,
      kind: "invoice.paid",
      pendingOrderId: "declared_capacity_order",
      invoice: {
        id: "in_declared_capacity",
        status: "paid",
        currency: "gbp",
        linesComplete: true,
        lines: [
          {
            priceId: "price_capacitybase",
            quantity: 1,
            amountPence: 7_400,
          },
          {
            priceId: "price_capacityfinance",
            quantity: 1,
            amountPence: 2_000,
          },
        ],
      },
    };
    const pendingOrder = {
      id: "declared_capacity_order",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "DECLARED_CAPACITY_STARTER_MONTHLY",
      institutionalSnapshotId: "declared_capacity_snapshot",
      institutionalCheckoutKey: "declared-capacity-checkout",
      createdAt,
      status: PendingOrderStatus.PENDING,
    };
    prismaMock.pendingOrder.findUnique.mockResolvedValue(pendingOrder);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.institutionalBillingSnapshot.findFirst.mockResolvedValue({
      id: pendingOrder.institutionalSnapshotId,
      orgId: baseEvent.orgId,
      kind: "QUOTE",
      status: "PRICED",
      planCode: pendingOrder.planCode,
      pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
      declaredCapacity: 0,
      countSource: null,
      enrolledChildren: null,
      subtotalPence: 9_400,
      includedModules: [],
      paidModules: [Module.FINANCE],
      selectedTrialModules: [Module.LEARNING],
      lines: [
        {
          component: "BASE",
          priceCode: "DECLARED_CAPACITY_BASE_MONTHLY",
          priceId: "price_capacitybase",
          currency: "GBP",
          quantity: 1,
          unitAmountPence: 7_400,
          subtotalPence: 7_400,
        },
        {
          component: "DECLARED_CAPACITY",
          priceCode: "DECLARED_CAPACITY_CHILD_MONTHLY",
          priceId: "price_capacitychild",
          currency: "GBP",
          quantity: 0,
          unitAmountPence: 100,
          subtotalPence: 0,
        },
        {
          component: "ADDON",
          priceCode: "MODULE_FINANCE_MONTHLY",
          priceId: "price_capacityfinance",
          currency: "GBP",
          quantity: 1,
          unitAmountPence: 2_000,
          subtotalPence: 2_000,
        },
      ],
      createdAt: new Date(createdAt.getTime() - 60_000),
      expiresAt: new Date(createdAt.getTime() + 14 * 60_000),
      acceptance: {
        id: "declared_capacity_acceptance",
        acceptedAt: new Date(createdAt.getTime() - 30_000),
        effectiveAt: null,
      },
    });
    prismaMock.institutionalBillingPolicy.findUnique.mockResolvedValue({
      scheduledCapacityDecrease: null,
      scheduledCapacityEffectiveAt: null,
    });
    (provider.verifyAndParse as jest.Mock).mockResolvedValue(paidEvent);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.moduleGrant.upsert.mock.calls).toHaveLength(1);
    expect(prismaMock.moduleGrant.upsert.mock.calls[0][0].create).toMatchObject(
      {
        module: Module.FINANCE,
        source: ModuleGrantSource.PAID_ADDON,
      },
    );
    expect(
      prismaMock.moduleGrant.upsert.mock.calls.some(
        ([args]) => args.create.module === Module.LEARNING,
      ),
    ).toBe(false);
  });

  it("activates a payment after quote expiry when Checkout began while it was valid", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...event,
      occurredAt: new Date("2030-01-01T00:16:00Z"),
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalled();
    expect(prismaMock.pendingOrder.updateMany).toHaveBeenCalled();
  });

  it("honours a paid Checkout when a newer quote was created later", async () => {
    setupInstitutionalPayment("invoice.paid");
    const originalLookup =
      prismaMock.institutionalBillingSnapshot.findFirst.getMockImplementation();
    prismaMock.institutionalBillingSnapshot.findFirst.mockImplementation(
      async (args) =>
        args.where.supersedesId ? { id: "new_quote" } : originalLookup?.(args),
    );

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalled();
  });

  it("holds payment activation when Checkout began after quote expiry", async () => {
    setupInstitutionalPayment("invoice.paid");
    prismaMock.pendingOrder.findUnique.mockResolvedValue({
      id: "institutional_order_1",
      orgId: baseEvent.orgId,
      tenantId: "tenant_1",
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      institutionalSnapshotId: "snapshot_1",
      institutionalCheckoutKey: "checkout_1",
      createdAt: new Date("2030-01-01T00:16:00Z"),
      status: PendingOrderStatus.PENDING,
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.pendingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("holds payment activation when acceptance postdates Checkout", async () => {
    setupInstitutionalPayment("invoice.paid");
    prismaMock.institutionalBillingSnapshot.findFirst.mockResolvedValue({
      id: "snapshot_1",
      orgId: baseEvent.orgId,
      kind: "QUOTE",
      status: "PRICED",
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      pricingVersion: "ENROLLED_CHILDREN_V1",
      countSource: "DECLARED",
      enrolledChildren: 0,
      subtotalPence: 4_900,
      includedModules: [],
      paidModules: [],
      expiresAt: new Date("2030-01-01T00:14:00Z"),
      acceptance: {
        id: "acceptance_1",
        acceptedAt: new Date("2030-01-01T00:02:00Z"),
      },
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it("holds a mismatched institutional draft and marks billing for review", async () => {
    setupInstitutionalPayment("invoice.draft");
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.draft",
      pendingOrderId: "institutional_order_1",
      invoice: {
        id: "in_1",
        status: "draft",
        currency: "gbp",
        linesComplete: true,
        lines: [
          { priceId: "price_starter123", quantity: 1, amountPence: 5_000 },
        ],
      },
    });
    provider.holdDraftInvoice = jest.fn().mockResolvedValue(undefined);

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(provider.holdDraftInvoice).toHaveBeenCalledWith("in_1");
    expect(
      prismaMock.institutionalBillingPolicy.updateMany,
    ).toHaveBeenCalledWith({
      where: { orgId: baseEvent.orgId },
      data: { reviewReason: "INVOICE_MISMATCH" },
    });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it("does not acknowledge an unsafe draft hold", async () => {
    setupInstitutionalPayment("invoice.draft");
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...baseEvent,
      kind: "invoice.draft",
      pendingOrderId: "institutional_order_1",
      invoice: {
        id: "in_1",
        status: "draft",
        currency: "gbp",
        linesComplete: true,
        lines: [
          { priceId: "price_starter123", quantity: 1, amountPence: 5_000 },
        ],
      },
    });

    await expect(
      controller.handleWebhook({ dummy: true }, "test-signature"),
    ).rejects.toThrow("Institutional draft invoice could not be held");
    expect(finishBillingEvent).toHaveBeenCalledWith(
      "billing_event_1",
      baseEvent.orgId,
      false,
    );
  });

  it("never activates an institutional snapshot for a mismatched paid or failed invoice", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...event,
      invoice: {
        ...event.invoice!,
        lines: [
          { priceId: "price_starter123", quantity: 1, amountPence: 5_000 },
        ],
      },
    });
    await controller.handleWebhook({ dummy: true }, "test-signature");
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.pendingOrder.updateMany).not.toHaveBeenCalled();

    jest.clearAllMocks();
    setupInstitutionalPayment("invoice.payment_failed");
    await controller.handleWebhook({ dummy: true }, "test-signature");
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.pendingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("moves a matched frozen census into current paid state at renewal", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
    prismaMock.pendingOrder.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription_db_1",
      orgId: baseEvent.orgId,
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      status: SubscriptionStatus.ACTIVE,
      periodStart: new Date("2030-01-01T00:00:00Z"),
      periodEnd: new Date("2030-02-01T00:00:00Z"),
      currentInstitutionalSnapshotId: "snapshot_1",
      nextInstitutionalSnapshotId: "census_2",
    });
    prismaMock.institutionalBillingSnapshot.findFirst.mockResolvedValue({
      id: "census_2",
      orgId: baseEvent.orgId,
      kind: "CENSUS",
      status: "PRICED",
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      pricingVersion: "ENROLLED_CHILDREN_V1",
      enrolledChildren: 0,
      subtotalPence: 4_900,
      includedModules: [],
      paidModules: [],
      effectiveAt: new Date("2030-02-01T00:00:00Z"),
      acceptance: null,
    });
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...event,
      pendingOrderId: null,
      periodStart: new Date("2030-02-01T00:00:00Z"),
      periodEnd: new Date("2030-03-01T00:00:00Z"),
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentInstitutionalSnapshotId: "census_2",
          nextInstitutionalSnapshotId: null,
        }),
      }),
    );
    expect(prismaMock.orgEntitlementSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        maxSites: 1,
        source: "institutional_invoice",
      }),
    });
  });

  it("does not regress a newer paid period when an older invoice arrives late", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
    prismaMock.pendingOrder.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription_db_1",
      orgId: baseEvent.orgId,
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      status: SubscriptionStatus.ACTIVE,
      periodStart: new Date("2030-02-01T00:00:00Z"),
      periodEnd: new Date("2030-03-01T00:00:00Z"),
      currentInstitutionalSnapshotId: "snapshot_1",
      nextInstitutionalSnapshotId: null,
    });
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...event,
      pendingOrderId: null,
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(
      prismaMock.institutionalBillingPolicy.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("resolves a renewal invoice without organisation metadata from its stored subscription", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
    prismaMock.pendingOrder.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription_db_1",
      orgId: baseEvent.orgId,
      periodStart: new Date("2030-02-01T00:00:00Z"),
      currentInstitutionalSnapshotId: "snapshot_1",
    });
    (provider.verifyAndParse as jest.Mock).mockResolvedValue({
      ...event,
      pendingOrderId: null,
      orgId: "",
    });

    await controller.handleWebhook({ dummy: true }, "test-signature");

    expect(finishBillingEvent).toHaveBeenCalledWith(
      "billing_event_1",
      baseEvent.orgId,
      true,
    );
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it("resolves a metadata-free institutional event when the service is called directly", async () => {
    const event = setupInstitutionalPayment("invoice.paid");
    prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
    prismaMock.pendingOrder.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription_db_1",
      orgId: baseEvent.orgId,
      periodStart: new Date("2030-02-01T00:00:00Z"),
      currentInstitutionalSnapshotId: "snapshot_1",
    });

    const service = new InstitutionalWebhookService(provider, billingConfig);
    await expect(
      service.handle({ ...event, pendingOrderId: null, orgId: "" }),
    ).resolves.toBe(true);
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});
