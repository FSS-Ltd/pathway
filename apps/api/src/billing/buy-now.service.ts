import {
  Inject,
  Injectable,
  Optional,
  Logger,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import {
  prisma,
  PendingOrderStatus,
  SubscriptionStatus,
  OrgRole,
  type Module,
} from "@pathway/db";
import {
  getConfiguratorPlanPolicy,
  type ConfiguratorModuleCode,
} from "@pathway/pricing";
import { getPlanDefinition } from "./billing-plans";
import type { PlanTier } from "./billing-plans";
import { PlanPreviewService } from "./plan-preview.service";
import type { PlanPreviewAddons } from "./plan-preview.types";
import {
  type BuyNowCheckoutRequest,
  type BuyNowCheckoutResponse,
  type BuyNowCheckoutPreview,
  type OrgPurchaseRequest,
} from "./buy-now.types";
import {
  BuyNowProvider,
  type BuyNowCheckoutParams,
  type BuyNowProviderContext,
} from "./buy-now.provider";
import {
  BILLING_PROVIDER_CONFIG,
  activeProviderToPrismaProvider,
  type BillingProviderConfig,
} from "./billing-provider.config";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import { ADD_ON_SUBSCRIPTION_PLAN_PREFIX } from "./subscription-plan-code";

// Phase 0 PR 0.2: adds "professional" between growth and enterprise. Exported
// (not a local const) so it's directly testable without instantiating the service.
export const TIER_HIERARCHY: Record<PlanTier, number> = {
  core: 1,
  starter: 2,
  growth: 3,
  professional: 4,
  enterprise: 5,
};

@Injectable()
export class BuyNowService {
  private readonly logger = new Logger(BuyNowService.name);

  constructor(
    @Inject(PlanPreviewService)
    private readonly planPreviewService: PlanPreviewService,
    @Inject(BuyNowProvider)
    private readonly provider: BuyNowProvider,
    @Inject(Auth0ManagementService)
    private readonly auth0Management: Auth0ManagementService,
    @Optional()
    @Inject(PathwayRequestContext)
    private readonly requestContext?: PathwayRequestContext,
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly providerConfig?: BillingProviderConfig,
  ) {}

  async checkout(
    request: BuyNowCheckoutRequest,
  ): Promise<BuyNowCheckoutResponse> {
    // Normalize plan code for Stripe compatibility
    // Frontend sends CORE_*, Stripe expects MINIMUM_*
    const normalizedPlanCode = this.normalizePlanCode(request.plan.planCode);

    const sanitisedPlan = {
      ...request.plan,
      planCode: normalizedPlanCode,
      av30AddonBlocks: this.toNonNegativeInt(request.plan.av30AddonBlocks),
      extraSites: this.toNonNegativeInt(request.plan.extraSites),
      extraStorageGb: this.toNonNegativeInt(request.plan.extraStorageGb),
      extraSmsMessages: this.toNonNegativeInt(request.plan.extraSmsMessages),
      extraLeaderSeats: this.toNonNegativeInt(request.plan.extraLeaderSeats),
    };

    const planDefinition = getPlanDefinition(sanitisedPlan.planCode);
    const { selection: gatedPlan, warnings: gatingWarnings } =
      this.enforcePlanAddonPolicy(sanitisedPlan, planDefinition?.tier ?? null);
    const selectedModules = this.resolvePaidSelectedModules(
      sanitisedPlan.selectedModules,
      sanitisedPlan.planCode,
    );

    const previewAddons: PlanPreviewAddons = {
      extraAv30Blocks: gatedPlan.av30AddonBlocks,
      extraSites: gatedPlan.extraSites,
      extraStorageGb: gatedPlan.extraStorageGb,
      extraSmsMessages: gatedPlan.extraSmsMessages,
      extraLeaderSeats: gatedPlan.extraLeaderSeats,
    };

    const previewResult = this.planPreviewService.preview({
      planCode: sanitisedPlan.planCode,
      addons: previewAddons,
    });

    const billingPeriodNormalized =
      previewResult.billingPeriod && previewResult.billingPeriod !== "none"
        ? previewResult.billingPeriod
        : null;

    const preview: BuyNowCheckoutPreview = {
      planCode: previewResult.planCode,
      planTier: previewResult.planTier,
      billingPeriod: billingPeriodNormalized,
      av30Cap: previewResult.effectiveCaps.av30Cap,
      maxChildren: previewResult.effectiveCaps.maxChildren,
      maxSites: previewResult.effectiveCaps.maxSites,
      storageGbCap: previewResult.effectiveCaps.storageGbCap,
      smsMessagesCap: previewResult.effectiveCaps.smsMessagesCap,
      leaderSeatsIncluded: previewResult.effectiveCaps.leaderSeatsIncluded,
      source: planDefinition ? "plan_catalogue" : "fallback",
    };

    // For authenticated purchases, use existing org/tenant context
    const orgId = this.requestContext?.currentOrgId;
    const tenantId = this.requestContext?.currentTenantId;

    // For public buy-now, store org details to be created after payment confirmation
    let pendingOrgDetails: Record<string, string> | undefined;

    if (!orgId || !tenantId) {
      // Public buy-now: defer org/tenant/user creation until webhook confirms payment
      const orgSlug = this.generateSlug(request.org.orgName);
      const normalizedEmail = request.org.contactEmail.toLowerCase().trim();

      pendingOrgDetails = {
        orgName: request.org.orgName,
        slug: orgSlug,
        contactName: request.org.contactName,
        contactEmail: normalizedEmail,
        password: request.org.password,
        sector: request.org.sector ?? "",
        planCode: sanitisedPlan.planCode,
      };

      this.logger.log(
        `Deferring org/user creation for ${normalizedEmail} until payment confirmed`,
      );
    }

    const prismaProvider = activeProviderToPrismaProvider(
      this.providerConfig?.activeProvider ?? "FAKE",
    );

    const pendingOrder = await prisma.pendingOrder.create({
      data: {
        tenantId: tenantId ?? undefined,
        orgId: orgId ?? undefined,
        planCode: gatedPlan.planCode,
        av30Cap: previewResult.effectiveCaps.av30Cap ?? undefined,
        storageGbCap: previewResult.effectiveCaps.storageGbCap ?? undefined,
        smsMessagesCap: previewResult.effectiveCaps.smsMessagesCap ?? undefined,
        leaderSeatsIncluded:
          previewResult.effectiveCaps.leaderSeatsIncluded ?? undefined,
        maxSites: previewResult.effectiveCaps.maxSites ?? undefined,
        selectedModules,
        flags:
          previewResult.notes?.source === "plan_catalogue"
            ? undefined
            : { source: previewResult.notes?.source },
        warnings: previewResult.notes?.warnings ?? [],
        provider: prismaProvider,
        status: PendingOrderStatus.PENDING,
        pendingOrgDetails: pendingOrgDetails ?? undefined,
      },
    });

    const providerParams: BuyNowCheckoutParams = {
      plan: { ...gatedPlan, selectedModules },
      org: request.org,
      preview,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
      pendingOrderId: pendingOrder.id,
    };

    // Use placeholder IDs for public checkout (will be replaced after payment)
    const providerCtx: BuyNowProviderContext = {
      tenantId: tenantId ?? "pending",
      orgId: orgId ?? "pending",
    };

    const session = await this.provider.createCheckoutSession(
      providerParams,
      providerCtx,
    );

    await prisma.pendingOrder.update({
      where: { id: pendingOrder.id },
      data: { providerCheckoutId: session.sessionId },
    });

    const warnings = ["price_not_included", ...gatingWarnings];
    if (!planDefinition) warnings.push("unknown_plan_code");

    return {
      preview,
      provider: session.provider,
      sessionId: session.sessionId,
      sessionUrl: session.sessionUrl,
      warnings,
    };
  }

  private toNonNegativeInt(value?: number): number | undefined {
    if (typeof value !== "number" || Number.isNaN(value)) return undefined;
    return value < 0 ? 0 : Math.trunc(value);
  }

  private resolvePaidSelectedModules(
    selectedModules: readonly Module[] | undefined,
    planCode: string,
  ): Module[] {
    const policy = getConfiguratorPlanPolicy(planCode);
    if (!policy) {
      throw new BadRequestException(`Invalid plan code: ${planCode}`);
    }
    if (policy.outcome === "contact") {
      throw new BadRequestException(
        `Plan ${planCode} requires contact with sales`,
      );
    }

    const includedModules = new Set<ConfiguratorModuleCode>(
      policy.includedModules,
    );
    const eligibleOptionalModules = new Set<ConfiguratorModuleCode>(
      policy.eligibleOptionalModules,
    );
    const paidModules = [...new Set(selectedModules ?? [])].filter(
      (module) => !includedModules.has(module),
    );
    const ineligibleModules = paidModules.filter(
      (module) => !eligibleOptionalModules.has(module),
    );
    if (ineligibleModules.length > 0) {
      throw new BadRequestException(
        "Selected modules are not eligible for the selected plan.",
      );
    }

    if (paidModules.length === 0) return paidModules;

    const provider = this.providerConfig?.activeProvider ?? "FAKE";
    if (provider === "FAKE") return paidModules;
    if (provider === "GOCARDLESS") {
      throw new BadRequestException(
        "Selected modules are not supported by the active billing provider.",
      );
    }

    const intervalSuffix = planCode.endsWith("_YEARLY") ? "YEARLY" : "MONTHLY";
    const priceMap: Record<string, string | undefined> =
      this.providerConfig?.stripe.priceMap ?? {};
    const missingModules = paidModules.filter(
      (module) => !priceMap[`MODULE_${module}_${intervalSuffix}`],
    );
    if (missingModules.length > 0) {
      throw new BadRequestException(
        "Missing Stripe price configuration for selected modules.",
      );
    }

    return paidModules;
  }

  /**
   * Generate a URL-safe slug from an org name.
   */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);

    // Add random suffix to avoid collisions
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }

  /**
   * Purchase endpoint for authenticated organisation admins.
   * Creates Stripe Checkout session with enhanced metadata and validations.
   * @param contextOverride - Optional context from request (set by guard); used when injected requestContext is empty
   */
  async purchaseForOrg(
    request: OrgPurchaseRequest,
    contextOverride?: { orgId: string; tenantId?: string; userId: string },
  ): Promise<BuyNowCheckoutResponse> {
    const orgId = contextOverride?.orgId ?? this.requestContext?.currentOrgId;
    const tenantId =
      contextOverride?.tenantId ?? this.requestContext?.currentTenantId;
    const userId =
      contextOverride?.userId ?? this.requestContext?.currentUserId;

    if (!orgId || !userId) {
      throw new ForbiddenException(
        "Authentication required - org and user context missing",
      );
    }

    // 1. Verify user is org admin
    await this.ensureOrgAdmin(userId, orgId);

    const orgForMaster = await prisma.org.findUnique({
      where: { id: orgId },
      select: { isMasterOrg: true },
    });
    if (orgForMaster?.isMasterOrg) {
      throw new BadRequestException(
        "Master organisations cannot purchase plans or add-ons.",
      );
    }

    const normalizedPlanCode = this.normalizePlanCode(request.planCode);
    const selectedModules = this.resolvePaidSelectedModules(
      request.selectedModules,
      normalizedPlanCode,
    );

    // 2. If org has active subscription and selected plan is the same: allow checkout only for add-ons
    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        orgId,
        planCode: {
          not: { startsWith: ADD_ON_SUBSCRIPTION_PLAN_PREFIX },
        },
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
        },
      },
      select: { planCode: true },
    });

    const addonsOnly =
      Boolean(activeSubscription) &&
      activeSubscription!.planCode === normalizedPlanCode;

    const hasAddons =
      (this.toNonNegativeInt(request.av30AddonBlocks) ?? 0) > 0 ||
      (this.toNonNegativeInt(request.extraStorageGb) ?? 0) > 0 ||
      (this.toNonNegativeInt(request.extraSmsMessages) ?? 0) > 0 ||
      (this.toNonNegativeInt(request.extraSites) ?? 0) > 0 ||
      (this.toNonNegativeInt(request.extraLeaderSeats) ?? 0) > 0 ||
      selectedModules.length > 0;

    if (addonsOnly && !hasAddons) {
      throw new BadRequestException(
        "You're already on this plan. Add add-ons above to checkout, or choose a different plan.",
      );
    }

    // 3. Allow plan change: do not block when org already has a subscription (we'll cancel the old one in the webhook when the new checkout completes). If they abandon checkout, they keep their current plan.

    // 4. Validate upgrade path only when changing plan (no downgrades)
    if (!addonsOnly) {
      await this.validateUpgradePath(orgId, request.planCode);
    }

    const planDefinition = getPlanDefinition(normalizedPlanCode);
    if (!planDefinition) {
      throw new BadRequestException(`Invalid plan code: ${request.planCode}`);
    }

    if (!planDefinition.selfServe) {
      throw new BadRequestException(
        `Plan ${request.planCode} requires contact with sales`,
      );
    }

    // 5. Build preview with addons
    const previewAddons: PlanPreviewAddons = {
      extraAv30Blocks: this.toNonNegativeInt(request.av30AddonBlocks),
      extraSites: this.toNonNegativeInt(request.extraSites),
      extraStorageGb: this.toNonNegativeInt(request.extraStorageGb),
      extraSmsMessages: this.toNonNegativeInt(request.extraSmsMessages),
      extraLeaderSeats: this.toNonNegativeInt(request.extraLeaderSeats),
    };
    const { selection: gatedAddons, warnings: gatingWarnings } =
      this.enforcePlanAddonPolicy(
        {
          planCode: normalizedPlanCode,
          av30AddonBlocks: previewAddons.extraAv30Blocks,
          extraSites: previewAddons.extraSites,
          extraStorageGb: previewAddons.extraStorageGb,
          extraSmsMessages: previewAddons.extraSmsMessages,
          extraLeaderSeats: previewAddons.extraLeaderSeats,
        },
        planDefinition.tier,
      );
    const hasAllowedAddons =
      (gatedAddons.av30AddonBlocks ?? 0) > 0 ||
      (gatedAddons.extraStorageGb ?? 0) > 0 ||
      (gatedAddons.extraSmsMessages ?? 0) > 0 ||
      (gatedAddons.extraSites ?? 0) > 0 ||
      (gatedAddons.extraLeaderSeats ?? 0) > 0 ||
      selectedModules.length > 0;
    if (addonsOnly && !hasAllowedAddons) {
      throw new BadRequestException(
        "You're already on this plan. Add add-ons above to checkout, or choose a different plan.",
      );
    }
    const previewResult = this.planPreviewService.preview({
      planCode: normalizedPlanCode,
      addons: {
        extraAv30Blocks: gatedAddons.av30AddonBlocks,
        extraSites: gatedAddons.extraSites,
        extraStorageGb: gatedAddons.extraStorageGb,
        extraSmsMessages: gatedAddons.extraSmsMessages,
        extraLeaderSeats: gatedAddons.extraLeaderSeats,
      },
    });

    const billingPeriodNormalized =
      previewResult.billingPeriod && previewResult.billingPeriod !== "none"
        ? previewResult.billingPeriod
        : null;

    const preview: BuyNowCheckoutPreview = {
      planCode: previewResult.planCode,
      planTier: previewResult.planTier,
      billingPeriod: billingPeriodNormalized,
      av30Cap: previewResult.effectiveCaps.av30Cap,
      maxChildren: previewResult.effectiveCaps.maxChildren,
      maxSites: previewResult.effectiveCaps.maxSites,
      storageGbCap: previewResult.effectiveCaps.storageGbCap,
      smsMessagesCap: previewResult.effectiveCaps.smsMessagesCap,
      leaderSeatsIncluded: previewResult.effectiveCaps.leaderSeatsIncluded,
      source: "plan_catalogue",
    };

    // 6. Fetch org details for metadata
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { name: true, stripeCustomerId: true },
    });

    if (!org) {
      throw new BadRequestException("Organisation not found");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    // 7. Create pending order
    const prismaProvider = activeProviderToPrismaProvider(
      this.providerConfig?.activeProvider ?? "FAKE",
    );
    const pendingOrder = await prisma.pendingOrder.create({
      data: {
        tenantId: tenantId ?? orgId,
        orgId,
        planCode: normalizedPlanCode,
        av30Cap: previewResult.effectiveCaps.av30Cap ?? undefined,
        storageGbCap: previewResult.effectiveCaps.storageGbCap ?? undefined,
        smsMessagesCap: previewResult.effectiveCaps.smsMessagesCap ?? undefined,
        leaderSeatsIncluded:
          previewResult.effectiveCaps.leaderSeatsIncluded ?? undefined,
        maxSites: previewResult.effectiveCaps.maxSites ?? undefined,
        selectedModules,
        flags: addonsOnly ? { purchaseKind: "add-on" } : undefined,
        provider: prismaProvider,
        status: PendingOrderStatus.PENDING,
      },
    });

    // 8. Build provider params with org details and addons
    const providerParams: BuyNowCheckoutParams = {
      plan: {
        planCode: normalizedPlanCode,
        av30AddonBlocks: gatedAddons.av30AddonBlocks,
        extraSites: gatedAddons.extraSites,
        extraStorageGb: gatedAddons.extraStorageGb,
        extraSmsMessages: gatedAddons.extraSmsMessages,
        extraLeaderSeats: gatedAddons.extraLeaderSeats,
        selectedModules,
      },
      org: {
        orgName: org.name,
        contactName: user?.name ?? "Unknown",
        contactEmail: user?.email ?? "",
        password: "", // Not used for existing orgs
      },
      preview,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
      pendingOrderId: pendingOrder.id,
      userId, // Pass initiating user ID
      stripeCustomerId: org.stripeCustomerId ?? undefined,
      addonsOnly, // When true, Stripe checkout includes only add-on line items (no plan)
    };

    const providerCtx: BuyNowProviderContext = {
      tenantId: tenantId ?? orgId,
      orgId,
    };

    // 9. Create checkout session
    const session = await this.provider.createCheckoutSession(
      providerParams,
      providerCtx,
    );

    await prisma.pendingOrder.update({
      where: { id: pendingOrder.id },
      data: { providerCheckoutId: session.sessionId },
    });

    return {
      preview,
      provider: session.provider,
      sessionId: session.sessionId,
      sessionUrl: session.sessionUrl,
      warnings: gatingWarnings,
    };
  }

  private async ensureOrgAdmin(userId: string, orgId: string): Promise<void> {
    const membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true },
    });

    if (!membership || membership.role !== OrgRole.ORG_ADMIN) {
      throw new ForbiddenException(
        "Only organisation administrators can purchase plans",
      );
    }
  }

  private async preventDuplicateSubscription(orgId: string): Promise<void> {
    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        orgId,
        planCode: {
          not: { startsWith: ADD_ON_SUBSCRIPTION_PLAN_PREFIX },
        },
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
        },
      },
      select: { id: true, planCode: true, status: true },
    });

    if (activeSubscription) {
      throw new ConflictException(
        `Organisation already has an active subscription (${activeSubscription.planCode}). Please cancel your current subscription before purchasing a new plan.`,
      );
    }
  }

  private async validateUpgradePath(
    orgId: string,
    newPlanCode: string,
  ): Promise<void> {
    const normalizedNewPlan = this.normalizePlanCode(newPlanCode);
    const newPlanDef = getPlanDefinition(normalizedNewPlan);

    if (!newPlanDef) {
      throw new BadRequestException(`Invalid plan code: ${newPlanCode}`);
    }

    // Check if org has any previous subscriptions (active, canceled, or past_due)
    const latestSubscription = await prisma.subscription.findFirst({
      where: {
        orgId,
        planCode: {
          not: { startsWith: ADD_ON_SUBSCRIPTION_PLAN_PREFIX },
        },
      },
      orderBy: { createdAt: "desc" },
      select: { planCode: true, status: true },
    });

    if (!latestSubscription) {
      // First subscription - allow any plan
      return;
    }

    const currentPlanDef = getPlanDefinition(latestSubscription.planCode);
    if (!currentPlanDef) {
      // Unknown current plan - allow upgrade
      this.logger.warn(
        `Unknown current plan ${latestSubscription.planCode} for org ${orgId}`,
      );
      return;
    }

    const currentTierLevel = TIER_HIERARCHY[currentPlanDef.tier];
    const newTierLevel = TIER_HIERARCHY[newPlanDef.tier];

    if (newTierLevel < currentTierLevel) {
      throw new BadRequestException(
        `Downgrade from ${currentPlanDef.displayName} to ${newPlanDef.displayName} is not supported. Please contact support for assistance with plan changes.`,
      );
    }
  }

  /**
   * Normalize plan code for Stripe compatibility.
   * Frontend may send CORE_*, but Stripe expects MINIMUM_*.
   */
  private normalizePlanCode(planCode: string): string {
    if (planCode === "CORE_MONTHLY") return "MINIMUM_MONTHLY";
    if (planCode === "CORE_YEARLY") return "MINIMUM_YEARLY";
    return planCode;
  }

  private enforcePlanAddonPolicy(
    selection: {
      planCode: string;
      av30AddonBlocks?: number;
      extraSites?: number;
      extraStorageGb?: number;
      extraSmsMessages?: number;
      extraLeaderSeats?: number;
    },
    planTier: PlanTier | null,
  ): {
    selection: {
      planCode: string;
      av30AddonBlocks?: number;
      extraSites?: number;
      extraStorageGb?: number;
      extraSmsMessages?: number;
      extraLeaderSeats?: number;
    };
    warnings: string[];
  } {
    if (planTier !== "core") {
      return { selection, warnings: [] };
    }

    const warnings: string[] = [];
    const av30AddonBlocks = selection.av30AddonBlocks ?? 0;
    const extraSites = selection.extraSites ?? 0;
    if (av30AddonBlocks > 0) warnings.push("core_capacity_addon_blocked_av30");
    if (extraSites > 0) warnings.push("core_capacity_addon_blocked_sites");

    return {
      selection: {
        ...selection,
        av30AddonBlocks: 0,
        extraSites: 0,
      },
      warnings,
    };
  }
}
