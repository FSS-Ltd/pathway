import { EntitlementsService } from "../entitlements.service";
import { BillingProvider, SubscriptionStatus } from "@pathway/db";

const prismaMock = {
  org: { findUnique: jest.fn() },
  subscription: { findFirst: jest.fn() },
  orgEntitlementSnapshot: { findFirst: jest.fn() },
  usageCounters: { findFirst: jest.fn() },
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

describe("EntitlementsService", () => {
  const orgId = "org_test_123";
  let service: EntitlementsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.org.findUnique.mockResolvedValue({ isMasterOrg: false });
    service = new EntitlementsService();
  });

  it("returns unlimited entitlements for master org without querying subscription", async () => {
    prismaMock.org.findUnique.mockResolvedValue({ isMasterOrg: true });

    const result = await service.resolve(orgId);

    expect(result.isMasterOrg).toBe(true);
    expect(result.subscriptionStatus).toBe("NONE");
    expect(result.subscription).toBeUndefined();
    expect(result.av30Cap).toBeNull();
    expect(result.maxChildren).toBeNull();
    expect(result.maxSites).toBeNull();
    expect(result.source).toBe("master_org");
    expect(prismaMock.subscription.findFirst).not.toHaveBeenCalled();
  });

  it("uses snapshot caps when both snapshot and plan exist", async () => {
    const subscription = {
      id: "sub_123",
      orgId,
      provider: BillingProvider.STRIPE,
      planCode: "STARTER_MONTHLY",
      status: SubscriptionStatus.ACTIVE,
      periodStart: new Date("2024-01-01T00:00:00Z"),
      periodEnd: new Date("2024-02-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
      createdAt: new Date("2023-12-15T00:00:00Z"),
      updatedAt: new Date("2024-01-15T00:00:00Z"),
    };
    const snapshot = {
      id: "snap_123",
      orgId,
      maxSites: 2,
      av30Included: 75, // Snapshot should override plan catalogue (plan has 50).
      leaderSeatsIncluded: 10,
      storageGbIncluded: 120,
      flagsJson: { smsMessagesCap: 900 },
      source: "snapshot",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    const usage = {
      id: "usage_123",
      orgId,
      av30: 12,
      storageGb: 10,
      smsMonth: 150,
      exportsMonth: 0,
      calculatedAt: new Date("2024-01-10T00:00:00Z"),
    };

    prismaMock.subscription.findFirst.mockResolvedValue(subscription);
    prismaMock.orgEntitlementSnapshot.findFirst.mockResolvedValue(snapshot);
    prismaMock.usageCounters.findFirst.mockResolvedValue(usage);

    const result = await service.resolve(orgId);

    expect(result.isMasterOrg).toBe(false);
    expect(result.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(result.subscription).toEqual(
      expect.objectContaining({
        id: subscription.id,
        provider: BillingProvider.STRIPE,
        planCode: "STARTER_MONTHLY",
        periodEnd: subscription.periodEnd,
      }),
    );
    expect(result.av30Cap).toBe(75);
    expect(result.maxChildren).toBeNull();
    expect(result.leaderSeatsIncluded).toBe(10);
    expect(result.storageGbCap).toBe(120);
    expect(result.smsMessagesCap).toBe(900);
    expect(result.currentAv30).toBe(12);
    expect(result.storageGbUsage).toBe(10);
    expect(result.smsMonthUsage).toBe(150);
    expect(result.source).toBe("snapshot");
  });

  it("uses plan catalogue when snapshot is missing", async () => {
    const subscription = {
      id: "sub_cancel",
      orgId,
      provider: BillingProvider.STRIPE,
      planCode: "GROWTH_YEARLY",
      status: SubscriptionStatus.CANCELED,
      periodStart: new Date("2023-10-01T00:00:00Z"),
      periodEnd: new Date("2023-11-01T00:00:00Z"),
      cancelAtPeriodEnd: true,
      createdAt: new Date("2023-09-15T00:00:00Z"),
      updatedAt: new Date("2023-10-15T00:00:00Z"),
    };

    prismaMock.subscription.findFirst.mockResolvedValue(subscription);
    prismaMock.orgEntitlementSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.usageCounters.findFirst.mockResolvedValue(null);

    const result = await service.resolve(orgId);

    expect(result.isMasterOrg).toBe(false);
    expect(result.subscriptionStatus).toBe(SubscriptionStatus.CANCELED);
    expect(result.av30Cap).toBe(200);
    expect(result.maxChildren).toBeNull();
    expect(result.maxSites).toBe(3);
    expect(result.storageGbCap).toBeNull();
    expect(result.smsMessagesCap).toBeNull();
    expect(result.leaderSeatsIncluded).toBeNull();
    expect(result.subscription?.planCode).toBe("GROWTH_YEARLY");
    expect(result.source).toBe("plan_catalogue");
    expect(result.flags).toEqual(
      expect.objectContaining({ planTier: "growth", planCode: "GROWTH_YEARLY" }),
    );
  });

  it("falls back safely when planCode is unknown", async () => {
    const subscription = {
      id: "sub_legacy",
      orgId,
      provider: BillingProvider.STRIPE,
      planCode: "LEGACY_PLAN_CODE",
      status: SubscriptionStatus.ACTIVE,
      periodStart: new Date("2023-06-01T00:00:00Z"),
      periodEnd: new Date("2023-07-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
      createdAt: new Date("2023-05-15T00:00:00Z"),
      updatedAt: new Date("2023-06-15T00:00:00Z"),
    };

    prismaMock.subscription.findFirst.mockResolvedValue(subscription);
    prismaMock.orgEntitlementSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.usageCounters.findFirst.mockResolvedValue(null);

    const result = await service.resolve(orgId);

    expect(result.isMasterOrg).toBe(false);
    expect(result.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(result.subscription?.planCode).toBe("LEGACY_PLAN_CODE");
    expect(result.av30Cap).toBeNull();
    expect(result.maxChildren).toBeNull();
    expect(result.smsMessagesCap).toBeNull();
    expect(result.source).toBe("fallback");
  });

  it("handles orgs with no subscription or usage gracefully", async () => {
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.orgEntitlementSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.usageCounters.findFirst.mockResolvedValue(null);

    const result = await service.resolve(orgId);

    expect(result.isMasterOrg).toBe(false);
    expect(result.subscriptionStatus).toBe("NONE");
    expect(result.subscription).toBeUndefined();
    expect(result.av30Cap).toBeNull();
    expect(result.maxChildren).toBeNull();
    expect(result.currentAv30).toBeNull();
    expect(result.smsMessagesCap).toBeNull();
    expect(result.source).toBe("fallback");
  });

  it("resolves maxChildren from snapshot flags before plan fallback", async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      id: "sub_core",
      orgId,
      provider: BillingProvider.STRIPE,
      planCode: "CORE_MONTHLY",
      status: SubscriptionStatus.ACTIVE,
      periodStart: new Date("2024-01-01T00:00:00Z"),
      periodEnd: new Date("2024-02-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
      createdAt: new Date("2023-12-15T00:00:00Z"),
      updatedAt: new Date("2024-01-15T00:00:00Z"),
    });
    prismaMock.orgEntitlementSnapshot.findFirst.mockResolvedValue({
      id: "snap_core",
      orgId,
      maxSites: 1,
      av30Included: 15,
      leaderSeatsIncluded: 0,
      storageGbIncluded: 0,
      flagsJson: { maxChildrenIncluded: 50 },
      source: "snapshot",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    prismaMock.usageCounters.findFirst.mockResolvedValue(null);

    const result = await service.resolve(orgId);
    expect(result.maxChildren).toBe(50);
  });
});
