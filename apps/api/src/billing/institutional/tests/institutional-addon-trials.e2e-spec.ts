import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  BillingProvider,
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

describe("institutional add-on trials (e2e)", () => {
  const oldApproved = process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
  const oldDelivered = process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
  let moduleRef: TestingModule;
  let trials: DeclaredCapacityAddonTrialsService;
  let orgId: string;
  let actorUserId: string;
  let policyId: string;
  let snapshotId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES =
      "EVENTS,TRANSPORT,MEALS,FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES =
      "EVENTS,TRANSPORT,MEALS,FINANCE";

    orgId = randomUUID();
    const tenantId = randomUUID();
    actorUserId = randomUUID();
    policyId = randomUUID();
    snapshotId = randomUUID();
    subscriptionId = randomUUID();
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Add-on trial test",
        slug: `addon-trial-${orgId}`,
        planCode: "DECLARED_CAPACITY_STARTER_MONTHLY",
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
        DeclaredCapacityAddonTrialsService,
        {
          provide: InstitutionalPriceResolver,
          useValue: { resolve: async () => priceMap },
        },
      ],
    }).compile();
    trials = moduleRef.get(DeclaredCapacityAddonTrialsService);
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
});
