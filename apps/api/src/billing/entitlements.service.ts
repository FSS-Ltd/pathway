import { Injectable, Optional } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { prisma, SubscriptionStatus, BillingProvider } from "@pathway/db";
import { getPlanDefinition } from "./billing-plans";

export type SubscriptionState = SubscriptionStatus | "NONE";

export type ResolvedEntitlements = {
  orgId: string;
  isMasterOrg: boolean;
  subscriptionStatus: SubscriptionState;
  subscription?:
    | {
        id: string;
        provider: BillingProvider;
        planCode: string;
        status: SubscriptionStatus;
        periodStart: Date;
        periodEnd: Date;
        cancelAtPeriodEnd: boolean;
      }
    | undefined;
  av30Cap: number | null;
  maxChildren: number | null;
  storageGbCap: number | null;
  smsMessagesCap: number | null;
  leaderSeatsIncluded: number | null;
  maxSites: number | null;
  currentAv30: number | null;
  storageGbUsage: number | null;
  smsMonthUsage: number | null;
  usageCalculatedAt: Date | null;
  flags: Record<string, unknown> | null;
  source: string | null;
};

@Injectable()
export class EntitlementsService {
  constructor(
    @Optional()
    private readonly requestContext?: PathwayRequestContext,
  ) {}

  /**
   * Resolve entitlements for an org. If orgId is omitted, uses the current
   * request context (when available). Does not enforce limits; callers can use
   * the resolved data for enforcement/UX decisions.
   */
  async resolve(orgId?: string): Promise<ResolvedEntitlements> {
    const resolvedOrgId = this.resolveOrgId(orgId);

    const org = await prisma.org.findUnique({
      where: { id: resolvedOrgId },
      select: { isMasterOrg: true },
    });
    if (!org) {
      throw new Error(`Org not found: ${resolvedOrgId}`);
    }
    if (org.isMasterOrg) {
      return {
        orgId: resolvedOrgId,
        isMasterOrg: true,
        subscriptionStatus: "NONE",
        subscription: undefined,
        av30Cap: null,
        maxChildren: null,
        storageGbCap: null,
        smsMessagesCap: null,
        leaderSeatsIncluded: null,
        maxSites: null,
        currentAv30: null,
        storageGbUsage: null,
        smsMonthUsage: null,
        usageCalculatedAt: null,
        flags: { planTier: "enterprise", planCode: "MASTER" },
        source: "master_org",
      };
    }

    const [subscription, snapshot, usage] = await Promise.all([
      prisma.subscription.findFirst({
        where: { orgId: resolvedOrgId },
        orderBy: [{ periodEnd: "desc" }],
      }),
      prisma.orgEntitlementSnapshot.findFirst({
        where: { orgId: resolvedOrgId },
        orderBy: [{ createdAt: "desc" }],
      }),
      prisma.usageCounters.findFirst({
        where: { orgId: resolvedOrgId },
        orderBy: [{ calculatedAt: "desc" }],
      }),
    ]);

    // Snapshot wins; plan catalogue provides defaults when no snapshot exists.
    const planDefinition = getPlanDefinition(subscription?.planCode);

    const flagsFromSnapshot = toRecord(snapshot?.flagsJson);
    const smsMessagesCapFromSnapshot = numberOrNull(
      flagsFromSnapshot?.smsMessagesCap,
    );
    const maxChildrenFromSnapshot = numberOrNull(
      flagsFromSnapshot?.maxChildrenIncluded,
    );

    const av30Cap =
      snapshot?.av30Included ?? planDefinition?.av30Included ?? null;
    const maxChildren =
      maxChildrenFromSnapshot ??
      (snapshot ? null : planDefinition?.maxChildrenIncluded ?? null);
    const storageGbCap =
      snapshot?.storageGbIncluded ?? planDefinition?.storageGbIncluded ?? null;
    const smsMessagesCap =
      smsMessagesCapFromSnapshot ??
      (snapshot ? null : planDefinition?.smsMessagesIncluded ?? null);
    const leaderSeatsIncluded =
      snapshot?.leaderSeatsIncluded ??
      planDefinition?.leaderSeatsIncluded ??
      null;
    const maxSites = snapshot?.maxSites ?? planDefinition?.maxSitesIncluded ?? null;

    const flags = snapshot
      ? flagsFromSnapshot
      : planDefinition
        ? {
            ...(planDefinition.flags ?? {}),
            planTier: planDefinition.tier,
            planCode: planDefinition.code,
          }
        : null;

    const source = snapshot
      ? snapshot.source ?? "snapshot"
      : planDefinition
        ? "plan_catalogue"
        : "fallback";

    return {
      orgId: resolvedOrgId,
      isMasterOrg: false,
      subscriptionStatus: subscription?.status ?? "NONE",
      subscription: subscription
        ? {
            id: subscription.id,
            provider: subscription.provider,
            planCode: subscription.planCode,
            status: subscription.status,
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : undefined,
      av30Cap,
      maxChildren,
      storageGbCap,
      smsMessagesCap,
      leaderSeatsIncluded,
      maxSites,
      currentAv30: usage?.av30 ?? null,
      storageGbUsage: usage?.storageGb ?? null,
      smsMonthUsage: usage?.smsMonth ?? null,
      usageCalculatedAt: usage?.calculatedAt ?? null,
      flags,
      source,
    };
  }

  private resolveOrgId(orgId?: string): string {
    if (orgId) return orgId;
    const contextOrgId = this.requestContext?.currentOrgId;
    if (contextOrgId) return contextOrgId;
    throw new Error("orgId is required to resolve entitlements");
  }
}

const toRecord = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" ? value : null;
