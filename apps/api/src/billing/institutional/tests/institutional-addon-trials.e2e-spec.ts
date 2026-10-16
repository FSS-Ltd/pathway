jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    prices: {
      retrieve: async (priceId: string) => {
        const yearly = priceId.endsWith("year");
        return {
          id: priceId,
          active: true,
          livemode: false,
          currency: "gbp",
          unit_amount: yearly ? 20_000 : 2_000,
          recurring: {
            interval: yearly ? "year" : "month",
            interval_count: 1,
            usage_type: "licensed",
          },
        };
      },
    },
    checkout: {
      sessions: {
        create: async (input: { line_items: { price: string }[] }) => {
          const id = `cs_${input.line_items[0]?.price ?? "missing"}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          return {
            id,
            status: "open",
            url: `https://checkout.example.test/${id}`,
          };
        },
        retrieve: async (id: string) => ({
          id,
          status: "open",
          url: `https://checkout.example.test/${id}`,
        }),
      },
    },
  })),
}));

import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../../billing-provider.config";
import {
  BillingProvider,
  InstitutionalAddonInterval,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  InstitutionalAddonTrialStatus,
  Module,
  ModuleGrantSource,
  ModuleStatus,
  SubscriptionStatus,
  prisma,
  withOrgRlsContext,
} from "@pathway/db";
import { getOrgCapabilities, MODULE_CAPABILITIES } from "@pathway/platform";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { InstitutionalPriceResolver } from "../institutional-price-resolver";
import { DeclaredCapacityAddonTrialsService } from "../declared-capacity-addon-trials.service";
import { DeclaredCapacityAddonTrialExpiryService } from "../declared-capacity-addon-trial-expiry.service";
import { DeclaredCapacityAddonTrialWebhookService } from "../declared-capacity-addon-trial-webhook.service";
import { DeclaredCapacityAddonCheckoutService } from "../declared-capacity-addon-checkout.service";
import { OutboxService } from "../../../common/outbox/outbox.service";
import { MailerService } from "../../../mailer/mailer.service";

describe("institutional add-on trials (e2e)", () => {
  const oldApproved = process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
  const oldDelivered = process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
  const oldBillingEnabled = process.env.DECLARED_CAPACITY_BILLING_ENABLED;
  const oldProviderWrites = process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
  const oldCheckoutEnabled = process.env.INSTITUTIONAL_CHECKOUT_ENABLED;
  const oldAdminUrl = process.env.ADMIN_URL;
  let moduleRef: TestingModule;
  let trials: DeclaredCapacityAddonTrialsService;
  let expiry: DeclaredCapacityAddonTrialExpiryService;
  let addonWebhook: DeclaredCapacityAddonTrialWebhookService;
  let checkout: DeclaredCapacityAddonCheckoutService;
  let orgId: string;
  let actorUserId: string;
  let policyId: string;
  let snapshotId: string;
  let subscriptionId: string;
  let stripeCustomerId: string;
  const emailAvailable = jest.fn(() => true);
  const sendAddonTrialExpiryEmail = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES =
      "EVENTS,TRANSPORT,MEALS,FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES =
      "EVENTS,TRANSPORT,MEALS,FINANCE";
    process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED = "true";
    process.env.INSTITUTIONAL_CHECKOUT_ENABLED = "true";
    process.env.ADMIN_URL = "https://admin.example.test";

    orgId = randomUUID();
    const tenantId = randomUUID();
    actorUserId = randomUUID();
    policyId = randomUUID();
    snapshotId = randomUUID();
    subscriptionId = randomUUID();
    stripeCustomerId = `cus_${randomUUID()}`;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Add-on trial test",
        slug: `addon-trial-${orgId}`,
        planCode: "DECLARED_CAPACITY_STARTER_MONTHLY",
        stripeCustomerId,
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Main site",
        slug: `addon-trial-${tenantId}`,
      },
    });
    await prisma.user.create({
      data: {
        id: actorUserId,
        email: `addon-trial-${actorUserId}@example.test`,
        tenantId,
      },
    });
    await prisma.institutionalBillingPolicy.create({
      data: {
        id: policyId,
        orgId,
        pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
        timezone: "Europe/London",
        declaredCapacity: 74,
        declaredByUserId: actorUserId,
      },
    });
    await prisma.institutionalBillingSnapshot.create({
      data: {
        id: snapshotId,
        orgId,
        policyId,
        kind: InstitutionalSnapshotKind.QUOTE,
        status: InstitutionalSnapshotStatus.PRICED,
        planCode: "DECLARED_CAPACITY_STARTER_MONTHLY",
        pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
        declaredCapacity: 74,
        lines: [],
        subtotalPence: 14_800,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });
    await prisma.subscription.create({
      data: {
        id: subscriptionId,
        orgId,
        provider: BillingProvider.STRIPE,
        providerSubId: `sub_${subscriptionId}`,
        planCode: "DECLARED_CAPACITY_STARTER_MONTHLY",
        status: SubscriptionStatus.ACTIVE,
        periodStart: new Date("2030-01-01T00:00:00.000Z"),
        periodEnd: new Date("2030-02-01T00:00:00.000Z"),
        currentInstitutionalSnapshotId: snapshotId,
      },
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        DeclaredCapacityAddonTrialExpiryService,
        DeclaredCapacityAddonTrialsService,
        DeclaredCapacityAddonCheckoutService,
        DeclaredCapacityAddonTrialWebhookService,
        OutboxService,
        {
          provide: InstitutionalPriceResolver,
          useValue: { resolve: async () => priceMap },
        },
        {
          provide: BILLING_PROVIDER_CONFIG,
          useValue: {
            activeProvider: "STRIPE_TEST",
            stripe: { secretKey: "sk_test_disposable" },
            goCardless: {},
          } satisfies BillingProviderConfig,
        },
        {
          provide: MailerService,
          useValue: {
            isAddonTrialExpiryEmailAvailable: emailAvailable,
            sendAddonTrialExpiryEmail,
          },
        },
      ],
    }).compile();
    trials = moduleRef.get(DeclaredCapacityAddonTrialsService);
    expiry = moduleRef.get(DeclaredCapacityAddonTrialExpiryService);
    addonWebhook = moduleRef.get(DeclaredCapacityAddonTrialWebhookService);
    checkout = moduleRef.get(DeclaredCapacityAddonCheckoutService);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (oldApproved === undefined) {
      delete process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = oldApproved;
    }
    if (oldDelivered === undefined) {
      delete process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = oldDelivered;
    }
    if (oldBillingEnabled === undefined) {
      delete process.env.DECLARED_CAPACITY_BILLING_ENABLED;
    } else {
      process.env.DECLARED_CAPACITY_BILLING_ENABLED = oldBillingEnabled;
    }
    if (oldProviderWrites === undefined) {
      delete process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
    } else {
      process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED = oldProviderWrites;
    }
    if (oldCheckoutEnabled === undefined) {
      delete process.env.INSTITUTIONAL_CHECKOUT_ENABLED;
    } else {
      process.env.INSTITUTIONAL_CHECKOUT_ENABLED = oldCheckoutEnabled;
    }
    if (oldAdminUrl === undefined) {
      delete process.env.ADMIN_URL;
    } else {
      process.env.ADMIN_URL = oldAdminUrl;
    }
  });

  const priceMap = {
    DECLARED_CAPACITY_BASE_MONTHLY: {
      priceId: "price_trialmonthbase",
      unitAmountPence: 7_400,
    },
    DECLARED_CAPACITY_BASE_YEARLY: {
      priceId: "price_trialyearbase",
      unitAmountPence: 74_000,
    },
    DECLARED_CAPACITY_CHILD_MONTHLY: {
      priceId: "price_trialmonthchild",
      unitAmountPence: 100,
    },
    DECLARED_CAPACITY_CHILD_YEARLY: {
      priceId: "price_trialyearchild",
      unitAmountPence: 1_000,
    },
    MODULE_EVENTS_MONTHLY: {
      priceId: "price_eventsmonth",
      unitAmountPence: 2_000,
    },
    MODULE_EVENTS_YEARLY: {
      priceId: "price_eventsyear",
      unitAmountPence: 20_000,
    },
    MODULE_TRANSPORT_MONTHLY: {
      priceId: "price_transportmonth",
      unitAmountPence: 2_000,
    },
    MODULE_TRANSPORT_YEARLY: {
      priceId: "price_transportyear",
      unitAmountPence: 20_000,
    },
    MODULE_MEALS_MONTHLY: {
      priceId: "price_mealsmonth",
      unitAmountPence: 2_000,
    },
    MODULE_MEALS_YEARLY: {
      priceId: "price_mealsyear",
      unitAmountPence: 20_000,
    },
    MODULE_FINANCE_MONTHLY: {
      priceId: "price_financemonth",
      unitAmountPence: 2_000,
    },
    MODULE_FINANCE_YEARLY: {
      priceId: "price_financeyear",
      unitAmountPence: 20_000,
    },
  } satisfies Awaited<ReturnType<InstitutionalPriceResolver["resolve"]>>;

  async function moveCapacity(
    capacity: number,
    tier: "STARTER" | "GROWTH",
  ): Promise<void> {
    const nextSnapshotId = randomUUID();
    const planCode = `DECLARED_CAPACITY_${tier}_MONTHLY`;
    await prisma.institutionalBillingSnapshot.create({
      data: {
        id: nextSnapshotId,
        orgId,
        policyId,
        subscriptionId,
        kind: InstitutionalSnapshotKind.QUOTE,
        status: InstitutionalSnapshotStatus.PRICED,
        planCode,
        pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
        declaredCapacity: capacity,
        lines: [],
        subtotalPence: 7_400 + capacity * 100,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });
    await prisma.institutionalBillingPolicy.update({
      where: { orgId },
      data: { declaredCapacity: capacity },
    });
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { planCode, currentInstitutionalSnapshotId: nextSnapshotId },
    });
  }

  it("keeps selection pending, starts one exact trial on activation, and preserves lifetime slot use", async () => {
    if (!requireDatabase()) return;

    const selectedAt = new Date("2030-01-01T12:00:00.000Z");
    await expect(
      trials.select(orgId, Module.AI_WORKSPACE, selectedAt),
    ).rejects.toMatchObject({
      response: { code: "ADDON_MODULE_NOT_TRIAL_ELIGIBLE" },
    });
    const selected = await trials.select(orgId, Module.EVENTS, selectedAt);
    expect(selected).toMatchObject({
      status: InstitutionalAddonTrialStatus.SELECTED,
      activatedAt: null,
      expiresAt: null,
    });
    expect(
      (await trials.list(orgId, selectedAt)).trials.find(
        ({ module }) => module === Module.EVENTS,
      ),
    ).toMatchObject({ decisionRecorded: false });
    expect(
      await prisma.orgModule.findUnique({
        where: { orgId_module: { orgId, module: Module.EVENTS } },
      }),
    ).toBeNull();
    await trials.select(orgId, Module.TRANSPORT, selectedAt);
    expect((await trials.list(orgId, selectedAt)).remainingSlots).toBe(0);
    await expect(
      trials.select(orgId, Module.FINANCE, selectedAt),
    ).rejects.toMatchObject({
      response: { code: "ADDON_TRIAL_SLOTS_EXHAUSTED" },
    });
    expect(await trials.removeSelection(orgId, Module.TRANSPORT)).toEqual({
      removed: true,
    });
    expect(await trials.removeSelection(orgId, Module.EVENTS)).toEqual({
      removed: true,
    });

    await trials.select(orgId, Module.EVENTS, selectedAt);
    const activated = await trials.activate(
      orgId,
      actorUserId,
      Module.EVENTS,
      selectedAt,
    );
    expect(activated).toMatchObject({
      status: InstitutionalAddonTrialStatus.ACTIVE,
      activatedAt: selectedAt,
      expiresAt: new Date("2030-03-02T12:00:00.000Z"),
      activatedByUserId: actorUserId,
    });
    expect(
      await prisma.moduleGrant.findUnique({
        where: {
          orgId_module_source_sourceId: {
            orgId,
            module: Module.EVENTS,
            source: ModuleGrantSource.TRIAL,
            sourceId: activated.id,
          },
        },
      }),
    ).toMatchObject({
      status: ModuleStatus.ACTIVE,
      expiresAt: activated.expiresAt,
    });
    const replay = await trials.activate(
      orgId,
      actorUserId,
      Module.EVENTS,
      new Date(selectedAt.getTime() + 1_000),
    );
    expect(replay.expiresAt).toEqual(activated.expiresAt);

    await moveCapacity(75, "GROWTH");
    await trials.select(orgId, Module.TRANSPORT, selectedAt);
    await trials.activate(orgId, actorUserId, Module.TRANSPORT, selectedAt);
    await trials.select(orgId, Module.MEALS, selectedAt);
    await trials.activate(orgId, actorUserId, Module.MEALS, selectedAt);
    expect((await trials.list(orgId, selectedAt)).remainingSlots).toBe(0);

    await moveCapacity(74, "STARTER");
    await expect(
      trials.select(orgId, Module.FINANCE, selectedAt),
    ).rejects.toMatchObject({
      response: { code: "ADDON_TRIAL_SLOTS_EXHAUSTED" },
    });

    const expiryClock = jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2030-03-02T12:00:00.000Z").getTime());
    let capabilities: Awaited<ReturnType<typeof getOrgCapabilities>>;
    try {
      capabilities = await withOrgRlsContext(orgId, (tx) =>
        getOrgCapabilities(orgId, tx),
      );
    } finally {
      expiryClock.mockRestore();
    }
    expect(
      MODULE_CAPABILITIES.EVENTS.every(
        (capability) => !capabilities.includes(capability),
      ),
    ).toBe(true);
  });

  it("expires once, queues one email, records consent, and grants paid access only after a paid invoice", async () => {
    if (!requireDatabase()) return;
    const expiresAt = new Date("2030-03-02T12:00:00.000Z");
    const expiredAt = new Date(expiresAt.getTime() + 1);
    const dueOrgs = await prisma.$queryRaw<{ orgId: string }[]>`
      SELECT "orgId"
      FROM app.list_due_institutional_addon_trial_org_ids(${expiresAt})
    `;
    expect(dueOrgs.map(({ orgId: dueOrgId }) => dueOrgId)).toContain(orgId);

    expect(
      await expiry.expireDueForOrg(orgId, new Date(expiresAt.getTime() - 1)),
    ).toEqual({
      expired: 0,
    });
    expect(await expiry.expireDueForOrg(orgId, expiresAt)).toEqual({
      expired: 3,
    });
    expect(await expiry.expireDueForOrg(orgId, expiresAt)).toEqual({
      expired: 0,
    });
    const remainingDueOrgs = await prisma.$queryRaw<{ orgId: string }[]>`
      SELECT "orgId"
      FROM app.list_due_institutional_addon_trial_org_ids(${expiresAt})
    `;
    expect(
      remainingDueOrgs.map(({ orgId: dueOrgId }) => dueOrgId),
    ).not.toContain(orgId);
    const expiredTrials = await withOrgRlsContext(orgId, (tx) =>
      tx.institutionalAddonTrial.findMany({
        where: { orgId, status: InstitutionalAddonTrialStatus.EXPIRED },
      }),
    );
    expect(expiredTrials).toHaveLength(3);
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.outboxEvent.count({
          where: {
            orgId,
            eventType: "institutional.addon_trial.expired",
          },
        }),
      ),
    ).toBe(3);

    const eventTrial = expiredTrials.find(
      ({ module }) => module === Module.EVENTS,
    );
    const mealTrial = expiredTrials.find(
      ({ module }) => module === Module.MEALS,
    );
    const transportTrial = expiredTrials.find(
      ({ module }) => module === Module.TRANSPORT,
    );
    expect(eventTrial).toBeDefined();
    expect(mealTrial).toBeDefined();
    expect(transportTrial).toBeDefined();

    const idempotencyKey = `institutional-addon-trial-expiry:${eventTrial!.id}`;
    expect(
      await expiry.dispatchExpiryEmail(
        orgId,
        eventTrial!.id,
        idempotencyKey,
        expiresAt,
      ),
    ).toEqual({ sent: true });
    expect(
      await expiry.dispatchExpiryEmail(
        orgId,
        eventTrial!.id,
        idempotencyKey,
        expiresAt,
      ),
    ).toEqual({ sent: false });
    expect(sendAddonTrialExpiryEmail).toHaveBeenCalledTimes(1);
    expect(sendAddonTrialExpiryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `addon-trial-${actorUserId}@example.test`,
        trialId: eventTrial!.id,
      }),
    );

    emailAvailable.mockReturnValue(false);
    await expect(
      expiry.dispatchExpiryEmail(
        orgId,
        mealTrial!.id,
        `institutional-addon-trial-expiry:${mealTrial!.id}`,
        expiresAt,
      ),
    ).rejects.toMatchObject({
      response: { code: "ADDON_TRIAL_EMAIL_PROVIDER_UNAVAILABLE" },
    });
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.institutionalAddonTrial.findUnique({
          where: { id: mealTrial!.id },
          select: { expiryEmailSentAt: true },
        }),
      ),
    ).toEqual({ expiryEmailSentAt: null });
    emailAvailable.mockReturnValue(true);
    await expect(
      expiry.dispatchExpiryEmail(
        orgId,
        mealTrial!.id,
        `institutional-addon-trial-expiry:${mealTrial!.id}`,
        expiresAt,
      ),
    ).resolves.toEqual({ sent: true });

    await trials.decide(orgId, actorUserId, Module.EVENTS, true, expiredAt);
    await trials.decide(orgId, actorUserId, Module.MEALS, true, expiredAt);
    await trials.decide(orgId, actorUserId, Module.TRANSPORT, false, expiredAt);
    const listedAfterDecision = await trials.list(orgId, expiredAt);
    expect(
      listedAfterDecision.trials.find(({ module }) => module === Module.EVENTS),
    ).toMatchObject({
      status: InstitutionalAddonTrialStatus.EXPIRED,
      decisionRecorded: true,
    });
    expect(
      listedAfterDecision.trials.find(
        ({ module }) => module === Module.TRANSPORT,
      ),
    ).toMatchObject({
      status: InstitutionalAddonTrialStatus.DECLINED,
      decisionRecorded: true,
    });
    const decision = await withOrgRlsContext(orgId, (tx) =>
      tx.institutionalAddonTrial.findUnique({
        where: { id: transportTrial!.id },
        select: { status: true, decisionActorUserId: true, decidedAt: true },
      }),
    );
    expect(decision).toEqual({
      status: InstitutionalAddonTrialStatus.DECLINED,
      decisionActorUserId: actorUserId,
      decidedAt: expiredAt,
    });

    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";
    await expect(
      trials.priceReview(orgId, Module.EVENTS, expiredAt),
    ).resolves.toEqual({
      module: Module.EVENTS,
      currency: "GBP",
      monthly: { amountPence: 2_000 },
      yearly: { amountPence: 20_000 },
    });
    const monthlyCheckout = await checkout.startCheckout(
      orgId,
      Module.EVENTS,
      "MONTHLY",
      expiredAt,
    );
    expect(monthlyCheckout.checkoutUrl).toContain("cs_price_eventsmonth");
    await expect(
      checkout.startCheckout(orgId, Module.EVENTS, "MONTHLY", expiredAt),
    ).resolves.toEqual(monthlyCheckout);
    expect(
      await prisma.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module: Module.EVENTS } },
        select: { chosenPaidInterval: true, paidCheckoutSessionId: true },
      }),
    ).toMatchObject({
      chosenPaidInterval: InstitutionalAddonInterval.MONTHLY,
      paidCheckoutSessionId: expect.any(String),
    });

    const monthlyEvent = paidInvoiceEvent({
      orgId,
      trialId: eventTrial!.id,
      module: Module.EVENTS,
      providerCustomerId: stripeCustomerId,
      interval: "MONTHLY",
      priceId: priceMap.MODULE_EVENTS_MONTHLY.priceId,
      amountPence: priceMap.MODULE_EVENTS_MONTHLY.unitAmountPence,
      providerSubscriptionId: `sub_${randomUUID()}`,
      periodStart: expiresAt,
      periodEnd: new Date("2030-04-02T12:00:00.000Z"),
    });
    await addonWebhook.handle(monthlyEvent);
    await addonWebhook.handle(monthlyEvent);
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.institutionalAddonTrial.findUnique({
          where: { id: eventTrial!.id },
          select: { status: true, paidSubscriptionId: true },
        }),
      ),
    ).toMatchObject({ status: InstitutionalAddonTrialStatus.CONVERTED });
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.moduleGrant.findMany({
          where: {
            orgId,
            module: Module.EVENTS,
            source: ModuleGrantSource.PAID_ADDON,
            status: ModuleStatus.ACTIVE,
          },
        }),
      ),
    ).toHaveLength(1);

    const yearlyCheckout = await checkout.startCheckout(
      orgId,
      Module.MEALS,
      "YEARLY",
      expiredAt,
    );
    expect(yearlyCheckout.checkoutUrl).toContain("cs_price_mealsyear");
    const yearlyMeal = paidInvoiceEvent({
      orgId,
      trialId: mealTrial!.id,
      module: Module.MEALS,
      providerCustomerId: stripeCustomerId,
      interval: "YEARLY",
      priceId: priceMap.MODULE_MEALS_YEARLY.priceId,
      amountPence: priceMap.MODULE_MEALS_YEARLY.unitAmountPence,
      providerSubscriptionId: `sub_${randomUUID()}`,
      periodStart: expiresAt,
      periodEnd: new Date("2031-03-02T12:00:00.000Z"),
    });
    await addonWebhook.handle({
      ...yearlyMeal,
      eventId: `evt_failed_${randomUUID()}`,
      kind: "invoice.payment_failed",
      invoice: undefined,
    });
    expect(
      await prisma.subscription.findUnique({
        where: { providerSubId: yearlyMeal.subscriptionId },
      }),
    ).toBeNull();
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.moduleGrant.findFirst({
          where: {
            orgId,
            module: Module.MEALS,
            source: ModuleGrantSource.PAID_ADDON,
            status: ModuleStatus.ACTIVE,
          },
        }),
      ),
    ).toBeNull();
    await addonWebhook.handle(yearlyMeal);
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.moduleGrant.findFirst({
          where: {
            orgId,
            module: Module.MEALS,
            source: ModuleGrantSource.PAID_ADDON,
            status: ModuleStatus.ACTIVE,
          },
          select: { expiresAt: true },
        }),
      ),
    ).toEqual({ expiresAt: new Date("2031-03-02T12:00:00.000Z") });

    await addonWebhook.handle({
      ...monthlyEvent,
      eventId: `evt_failed_retry_${randomUUID()}`,
      kind: "invoice.payment_failed",
      invoice: undefined,
    });
    expect(
      await prisma.subscription.findUnique({
        where: { providerSubId: monthlyEvent.subscriptionId },
        select: { status: true },
      }),
    ).toEqual({ status: SubscriptionStatus.PAST_DUE });
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.moduleGrant.findFirst({
          where: {
            orgId,
            module: Module.EVENTS,
            source: ModuleGrantSource.PAID_ADDON,
            status: ModuleStatus.ACTIVE,
          },
        }),
      ),
    ).not.toBeNull();
    await addonWebhook.handle({
      ...monthlyEvent,
      eventId: `evt_canceled_${randomUUID()}`,
      kind: "subscription.canceled",
      status: SubscriptionStatus.CANCELED,
    });
    expect(
      await withOrgRlsContext(orgId, (tx) =>
        tx.moduleGrant.findFirst({
          where: {
            orgId,
            module: Module.EVENTS,
            source: ModuleGrantSource.PAID_ADDON,
            status: ModuleStatus.ACTIVE,
          },
        }),
      ),
    ).toBeNull();
  });
});

function paidInvoiceEvent(input: {
  orgId: string;
  trialId: string;
  module: Module;
  providerCustomerId: string;
  interval: "MONTHLY" | "YEARLY";
  priceId: string;
  amountPence: number;
  providerSubscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
}): import("../../billing-webhook.provider").ParsedBillingWebhookEvent {
  return {
    provider: BillingProvider.STRIPE,
    eventId: `evt_${randomUUID()}`,
    kind: "invoice.paid",
    orgId: input.orgId,
    subscriptionId: input.providerSubscriptionId,
    providerCustomerId: input.providerCustomerId,
    planCode: `ADD_ON:DECLARED_CAPACITY_${input.module}`,
    addonTrialId: input.trialId,
    addonModule: input.module,
    addonInterval: input.interval,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    invoice: {
      id: `in_${randomUUID()}`,
      status: "paid",
      currency: "gbp",
      linesComplete: true,
      lines: [
        {
          priceId: input.priceId,
          quantity: 1,
          amountPence: input.amountPence,
          proration: false,
        },
      ],
    },
  };
}
